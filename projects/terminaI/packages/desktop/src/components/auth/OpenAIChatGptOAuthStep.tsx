/**
 * @license
 * Copyright 2025 Google LLC
 * Portions Copyright 2025 TerminaI Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { openUrl } from '@tauri-apps/plugin-opener';
import type { AuthClient } from '../../utils/authClient';
import { useSettingsStore } from '../../stores/settingsStore';
import { Button } from '../ui/button';
import { Input } from '../ui/input';

interface Props {
  client: AuthClient;
  onDone: () => void;
  onCancel: () => void;
  onError: (message: string | null) => void;
  initialValues?: {
    model?: string;
    baseUrl?: string;
  };
}

const DEFAULT_CHATGPT_CODEX_BASE_URL = 'https://chatgpt.com/backend-api/codex';

export function OpenAIChatGptOAuthStep({
  client,
  onDone,
  onCancel,
  onError,
  initialValues,
}: Props) {
  const [model, setModel] = useState(initialValues?.model ?? '');
  const [baseUrl, setBaseUrl] = useState(
    initialValues?.baseUrl ?? DEFAULT_CHATGPT_CODEX_BASE_URL,
  );

  const [authUrl, setAuthUrl] = useState<string | null>(null);
  const [manualRedirectUrl, setManualRedirectUrl] = useState('');
  const [isStarting, setIsStarting] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [isPolling, setIsPolling] = useState(false);

  const intervalRef = useRef<number | null>(null);

  const stopPolling = useCallback(() => {
    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsPolling(false);
  }, []);

  const persistLocalSettings = useCallback(
    (config: { model: string; baseUrl?: string }) => {
      useSettingsStore.getState().setProvider('openai_chatgpt_oauth');
      useSettingsStore.getState().setOpenAIChatGptOauthConfig(config);
    },
    [],
  );

  const pollOnce = useCallback(async () => {
    try {
      const status = await client.getStatus();
      if (status.status === 'ok') {
        stopPolling();
        persistLocalSettings({
          model: model.trim(),
          baseUrl: baseUrl.trim() || undefined,
        });
        onDone();
        return;
      }
      if (status.status === 'error') {
        stopPolling();
        onError(status.message ?? 'OAuth failed');
        return;
      }
      if (status.status === 'required' && isPolling) {
        stopPolling();
        onError(status.message ?? 'OAuth did not complete');
      }
    } catch {
      // Ignore transient polling errors.
    }
  }, [
    baseUrl,
    client,
    isPolling,
    model,
    onDone,
    onError,
    persistLocalSettings,
    stopPolling,
  ]);

  const startPolling = useCallback(() => {
    stopPolling();
    setIsPolling(true);
    intervalRef.current = window.setInterval(() => {
      void pollOnce();
    }, 1000);
  }, [pollOnce, stopPolling]);

  const applyProviderSettings = useCallback(async (): Promise<boolean> => {
    const trimmedModel = model.trim();
    if (!trimmedModel) {
      onError('Model is required');
      return false;
    }

    onError(null);
    await client.switchProvider({
      provider: 'openai_chatgpt_oauth',
      openaiChatgptOauth: {
        model: trimmedModel,
        baseUrl: baseUrl.trim() || undefined,
      },
    });
    return true;
  }, [baseUrl, client, model, onError]);

  const startOAuth = useCallback(async () => {
    setIsStarting(true);
    try {
      if (!(await applyProviderSettings())) return;

      const current = await client.getStatus();
      if (current.status === 'ok') {
        persistLocalSettings({
          model: model.trim(),
          baseUrl: baseUrl.trim() || undefined,
        });
        onDone();
        return;
      }

      const res = await client.startOpenAIOAuth();
      setAuthUrl(res.authUrl);
      try {
        await openUrl(res.authUrl);
      } catch {
        window.open(res.authUrl, '_blank');
      }
      startPolling();
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to start OAuth';
      if (message.includes('(409)') || message.includes(' 409')) {
        startPolling();
        return;
      }
      onError(message);
    } finally {
      setIsStarting(false);
    }
  }, [
    applyProviderSettings,
    baseUrl,
    client,
    model,
    onDone,
    onError,
    persistLocalSettings,
    startPolling,
  ]);

  const completeManual = useCallback(async () => {
    const redirectUrl = manualRedirectUrl.trim();
    if (!redirectUrl) {
      onError('Paste the final redirect URL');
      return;
    }

    setIsCompleting(true);
    try {
      if (!(await applyProviderSettings())) return;

      const status = await client.completeOpenAIOAuth({ redirectUrl });
      if (status.status === 'ok') {
        persistLocalSettings({
          model: model.trim(),
          baseUrl: baseUrl.trim() || undefined,
        });
        onDone();
        return;
      }
      if (status.status === 'in_progress') {
        startPolling();
        return;
      }
      onError(status.message ?? 'OAuth did not complete');
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Failed to complete OAuth');
    } finally {
      setIsCompleting(false);
    }
  }, [
    applyProviderSettings,
    baseUrl,
    client,
    manualRedirectUrl,
    model,
    onDone,
    onError,
    persistLocalSettings,
    startPolling,
  ]);

  const cancelOAuth = useCallback(async () => {
    stopPolling();
    try {
      await client.cancelOpenAIOAuth();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Failed to cancel OAuth');
    } finally {
      setAuthUrl(null);
      onCancel();
    }
  }, [client, onCancel, onError, stopPolling]);

  useEffect(() => {
    void client
      .getStatus()
      .then((s) => {
        if (s.status === 'in_progress') {
          startPolling();
        }
      })
      .catch(() => {
        // ignore
      });

    return () => {
      stopPolling();
    };
  }, [client, startPolling, stopPolling]);

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground">
        Sign in with your ChatGPT subscription (Codex backend). We’ll open a
        browser window; after you finish, this wizard will automatically
        continue.
      </p>

      <div className="space-y-2">
        <label className="text-sm font-medium">Model</label>
        <Input
          placeholder="gpt-5.2-codex"
          value={model}
          onChange={(e) => setModel(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Base URL (optional)</label>
        <Input
          placeholder={DEFAULT_CHATGPT_CODEX_BASE_URL}
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
        />
      </div>

      <div className="flex gap-2">
        <Button onClick={() => void startOAuth()} disabled={isStarting}>
          {isStarting ? 'Opening…' : 'Open browser'}
        </Button>
        <Button variant="secondary" onClick={() => void cancelOAuth()}>
          Cancel
        </Button>
      </div>

      {isPolling && (
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <span>Waiting for sign-in…</span>
        </div>
      )}

      {authUrl && (
        <div className="text-xs text-muted-foreground">
          If the browser didn’t open, use this link:{' '}
          <a
            href={authUrl}
            className="underline"
            onClick={(e) => {
              e.preventDefault();
              void openUrl(authUrl).catch(() => window.open(authUrl, '_blank'));
            }}
          >
            {authUrl}
          </a>
        </div>
      )}

      <div className="border-t border-border pt-4 space-y-2">
        <p className="text-xs text-muted-foreground">
          If you can’t use the local callback (e.g. remote agent), paste the
          final redirect URL here:
        </p>
        <Input
          placeholder="https://auth.openai.com/…?code=…&state=…"
          value={manualRedirectUrl}
          onChange={(e) => setManualRedirectUrl(e.target.value)}
        />
        <Button
          variant="outline"
          onClick={() => void completeManual()}
          disabled={isCompleting}
        >
          {isCompleting ? 'Completing…' : 'Complete with pasted URL'}
        </Button>
      </div>
    </div>
  );
}
