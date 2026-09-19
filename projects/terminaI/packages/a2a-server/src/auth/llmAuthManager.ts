/**
 * @license
 * Copyright 2025 Google LLC
 * Portions Copyright 2025 TerminaI Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  checkGeminiAuthStatusNonInteractive,
  beginGeminiOAuthLoopbackFlow,
  AuthType,
  type ProviderConfig,
  saveApiKey,
  clearCachedCredentialFile,
  LlmProviderId,
  ChatGptOAuthClient,
  ChatGptOAuthCredentialStorage,
  DEFAULT_OPENAI_OAUTH_REDIRECT_PORT,
  tryImportFromCodexCli,
  tryImportFromOpenCode,
} from '@terminai/core';
import type { Config } from '@terminai/core';
import { logger } from '../utils/logger.js';
import * as http from 'node:http';
import { URL } from 'node:url';

export type LlmAuthStatus = 'ok' | 'required' | 'in_progress' | 'error';

export type OAuthErrorCode =
  | 'timeout'
  | 'denied'
  | 'state_mismatch'
  | 'server_bind_failed'
  | 'token_exchange_failed'
  | 'network_error';

export interface LlmAuthStatusResult {
  readonly status: LlmAuthStatus;
  readonly authType: AuthType | undefined;
  /** 3.5: Provider ID for Desktop to determine correct auth UI */
  readonly provider?:
    | 'gemini'
    | 'openai_compatible'
    | 'openai_chatgpt_oauth'
    | 'anthropic';
  readonly message?: string;
  readonly errorCode?: OAuthErrorCode;
}

export class AuthConflictError extends Error {
  readonly statusCode = 409;
}

export class LlmAuthManager {
  private readonly config: Config;
  private readonly getSelectedAuthType: () => AuthType | undefined;

  private effectiveAuthType: AuthType | undefined;

  private oauthFlow: {
    cancel: () => void;
    waitForCompletion: Promise<void>;
  } | null = null;

  private openaiOauthFlow: {
    cancel: () => void;
    waitForCompletion: Promise<void>;
    complete: (input: { code: string; state: string }) => Promise<void>;
    state: string;
  } | null = null;

  private attemptedOpenAiImport = false;
  private readonly openaiClient = new ChatGptOAuthClient();

  private lastErrorMessage: string | null = null;
  private lastErrorCode: OAuthErrorCode | undefined;

  private readonly getLoadedSettings:
    | (() => import('../config/settings.js').LoadedSettings)
    | undefined;

  constructor(input: {
    config: Config;
    getSelectedAuthType: () => AuthType | undefined;
    getLoadedSettings?: () => import('../config/settings.js').LoadedSettings;
  }) {
    this.config = input.config;
    this.getSelectedAuthType = input.getSelectedAuthType;
    this.getLoadedSettings = input.getLoadedSettings;
    this.effectiveAuthType = this.getSelectedAuthType();
  }

  async getStatus(): Promise<LlmAuthStatusResult> {
    const authType = this.effectiveAuthType ?? this.getSelectedAuthType();

    if (this.oauthFlow) {
      return {
        status: 'in_progress',
        authType,
        provider: 'gemini', // OAuth is Gemini-only
        message: 'OAuth sign-in in progress',
      };
    }

    if (this.openaiOauthFlow) {
      return {
        status: 'in_progress',
        authType: AuthType.USE_OPENAI_CHATGPT_OAUTH,
        provider: 'openai_chatgpt_oauth',
        message: 'OAuth sign-in in progress',
      };
    }

    // T3.1: Branch on provider
    const providerConfig = this.config.getProviderConfig();
    if (providerConfig.provider === LlmProviderId.OPENAI_COMPATIBLE) {
      // For OpenAI-compatible, check if the required env var is present
      const envVarName = providerConfig.auth?.envVarName || 'OPENAI_API_KEY';
      const hasApiKey = Boolean(process.env[envVarName]);
      if (hasApiKey) {
        return {
          status: 'ok',
          authType: AuthType.USE_OPENAI_COMPATIBLE,
          provider: 'openai_compatible',
        };
      } else {
        return {
          status: 'required',
          authType: AuthType.USE_OPENAI_COMPATIBLE,
          provider: 'openai_compatible',
          message: `OpenAI-compatible provider requires the ${envVarName} environment variable to be set.`,
        };
      }
    }

    if (providerConfig.provider === LlmProviderId.OPENAI_CHATGPT_OAUTH) {
      if (!this.attemptedOpenAiImport) {
        this.attemptedOpenAiImport = true;
        try {
          const imported =
            (await tryImportFromCodexCli(this.openaiClient)) ??
            (await tryImportFromOpenCode(this.openaiClient));
          if (imported) {
            await ChatGptOAuthCredentialStorage.save(imported);
          }
        } catch (e) {
          logger.warn('[LlmAuthManager] ChatGPT OAuth import failed:', e);
        }
      }

      const creds = await ChatGptOAuthCredentialStorage.load().catch(
        () => null,
      );
      if (creds) {
        return {
          status: 'ok',
          authType: AuthType.USE_OPENAI_CHATGPT_OAUTH,
          provider: 'openai_chatgpt_oauth',
        };
      }

      return {
        status: 'required',
        authType: AuthType.USE_OPENAI_CHATGPT_OAUTH,
        provider: 'openai_chatgpt_oauth',
        message: 'ChatGPT OAuth credentials missing. Start OAuth to sign in.',
      };
    }

    // Gemini provider: use existing checkGeminiAuthStatusNonInteractive
    const check = await checkGeminiAuthStatusNonInteractive(
      authType,
      process.env,
    );

    if (check.status === 'ok') {
      return { status: 'ok', authType, provider: 'gemini' };
    }

    if (check.status === 'required') {
      return {
        status: 'required',
        authType,
        provider: 'gemini',
        message: check.message ?? this.lastErrorMessage ?? undefined,
        errorCode: this.lastErrorCode,
      };
    }

    return {
      status: 'error',
      authType,
      provider: 'gemini',
      message: check.message ?? this.lastErrorMessage ?? undefined,
      errorCode: this.lastErrorCode,
    };
  }

  async submitGeminiApiKey(apiKey: string): Promise<LlmAuthStatusResult> {
    const trimmed = apiKey.trim();
    if (trimmed.length === 0) {
      return {
        status: 'required',
        authType: AuthType.USE_GEMINI,
        message: 'API key must be a non-empty string',
      };
    }

    this.effectiveAuthType = AuthType.USE_GEMINI;
    this.lastErrorMessage = null;
    await saveApiKey(trimmed);
    await this.config.refreshAuth(AuthType.USE_GEMINI);
    return this.getStatus();
  }

  async startGeminiOAuth(): Promise<{ authUrl: string }> {
    if (this.oauthFlow) {
      throw new AuthConflictError('OAuth already in progress');
    }

    this.effectiveAuthType = AuthType.LOGIN_WITH_GOOGLE;
    this.lastErrorMessage = null;

    const { authUrl, waitForCompletion, cancel } =
      await beginGeminiOAuthLoopbackFlow(this.config);

    this.oauthFlow = { waitForCompletion, cancel };

    // Do not block the request; update auth in the background.
    void waitForCompletion
      .then(async () => {
        await this.config.refreshAuth(AuthType.LOGIN_WITH_GOOGLE);
        this.lastErrorMessage = null;
        this.lastErrorCode = undefined;
      })
      .catch((err: unknown) => {
        const error = err instanceof Error ? err : new Error('OAuth failed');
        const { message, code } = this.mapOAuthError(error);
        this.lastErrorMessage = message;
        this.lastErrorCode = code;
        logger.warn('[LlmAuthManager] OAuth did not complete:', {
          message,
          code,
        });
      })
      .finally(() => {
        this.oauthFlow = null;
      });

    return { authUrl };
  }

  async startOpenAIOAuth(): Promise<{ authUrl: string }> {
    if (this.openaiOauthFlow) {
      throw new AuthConflictError('OAuth already in progress');
    }

    this.effectiveAuthType = AuthType.USE_OPENAI_CHATGPT_OAUTH;
    this.lastErrorMessage = null;
    this.lastErrorCode = undefined;

    const redirectUri = `http://127.0.0.1:${DEFAULT_OPENAI_OAUTH_REDIRECT_PORT}/auth/callback`;
    const { authUrl, state, codeVerifier } =
      this.openaiClient.startAuthorization({ redirectUri });

    const { waitForCompletion, cancel, complete } =
      await beginOpenAiLoopbackFlow({
        client: this.openaiClient,
        codeVerifier,
        state,
        redirectUri,
      });

    this.openaiOauthFlow = { waitForCompletion, cancel, complete, state };

    void waitForCompletion
      .then(() => {
        this.lastErrorMessage = null;
        this.lastErrorCode = undefined;
      })
      .catch((err: unknown) => {
        const error = err instanceof Error ? err : new Error('OAuth failed');
        const { message, code } = this.mapOAuthError(error);
        this.lastErrorMessage = message;
        this.lastErrorCode = code;
        logger.warn('[LlmAuthManager] ChatGPT OAuth did not complete:', {
          message,
          code,
        });
      })
      .finally(() => {
        this.openaiOauthFlow = null;
      });

    return { authUrl };
  }

  async completeOpenAIOAuth(input: {
    redirectUrl?: string;
    code?: string;
    state?: string;
  }): Promise<LlmAuthStatusResult> {
    if (!this.openaiOauthFlow) {
      return {
        status: 'required',
        authType: AuthType.USE_OPENAI_CHATGPT_OAUTH,
        provider: 'openai_chatgpt_oauth',
        message: 'No OAuth flow in progress',
      };
    }

    const parsed = parseOAuthCompletion(input);
    if (!parsed) {
      return {
        status: 'required',
        authType: AuthType.USE_OPENAI_CHATGPT_OAUTH,
        provider: 'openai_chatgpt_oauth',
        message: 'Invalid OAuth completion payload',
      };
    }

    if (parsed.state !== this.openaiOauthFlow.state) {
      return {
        status: 'error',
        authType: AuthType.USE_OPENAI_CHATGPT_OAUTH,
        provider: 'openai_chatgpt_oauth',
        message: 'Security error occurred during sign-in. Please try again.',
        errorCode: 'state_mismatch',
      };
    }

    await this.openaiOauthFlow.complete(parsed);
    await this.openaiOauthFlow.waitForCompletion;

    return this.getStatus();
  }

  async cancelOpenAIOAuth(): Promise<LlmAuthStatusResult> {
    if (this.openaiOauthFlow) {
      const cancel = this.openaiOauthFlow.cancel;
      this.openaiOauthFlow = null;
      try {
        cancel();
      } catch (err) {
        logger.warn('[LlmAuthManager] ChatGPT OAuth cancel threw:', err);
      }
    }
    this.lastErrorMessage = null;
    this.lastErrorCode = undefined;
    return this.getStatus();
  }

  async cancelGeminiOAuth(): Promise<LlmAuthStatusResult> {
    if (this.oauthFlow) {
      const cancel = this.oauthFlow.cancel;
      this.oauthFlow = null;
      try {
        cancel();
      } catch (err) {
        logger.warn('[LlmAuthManager] OAuth cancel threw:', err);
      }
    }
    this.lastErrorMessage = null;
    this.lastErrorCode = undefined;
    return this.getStatus();
  }

  async useGeminiVertex(): Promise<LlmAuthStatusResult> {
    this.effectiveAuthType = AuthType.USE_VERTEX_AI;

    const hasVertexEnv =
      (process.env['GOOGLE_CLOUD_PROJECT'] &&
        process.env['GOOGLE_CLOUD_LOCATION']) ||
      process.env['GOOGLE_API_KEY'];

    if (!hasVertexEnv) {
      return {
        status: 'required',
        authType: AuthType.USE_VERTEX_AI,
        message:
          'Vertex AI requires either GOOGLE_CLOUD_PROJECT + GOOGLE_CLOUD_LOCATION, or GOOGLE_API_KEY (express mode).',
      };
    }

    await this.config.refreshAuth(AuthType.USE_VERTEX_AI);
    return this.getStatus();
  }

  async clearGeminiAuth(): Promise<LlmAuthStatusResult> {
    // Cancel any in-progress OAuth flow
    if (this.oauthFlow) {
      const cancel = this.oauthFlow.cancel;
      this.oauthFlow = null;
      try {
        cancel();
      } catch (err) {
        logger.warn('[LlmAuthManager] OAuth cancel during clear threw:', err);
      }
    }

    // Clear OAuth credentials
    try {
      await clearCachedCredentialFile();
    } catch (err) {
      logger.warn('[LlmAuthManager] Failed to clear cached credentials:', err);
    }

    // Reset effective auth type to undefined to force re-selection
    this.effectiveAuthType = undefined;
    this.lastErrorMessage = null;
    this.lastErrorCode = undefined;

    return this.getStatus();
  }

  async clearOpenAIAuth(): Promise<LlmAuthStatusResult> {
    if (this.openaiOauthFlow) {
      const cancel = this.openaiOauthFlow.cancel;
      this.openaiOauthFlow = null;
      try {
        cancel();
      } catch (err) {
        logger.warn(
          '[LlmAuthManager] ChatGPT OAuth cancel during clear threw:',
          err,
        );
      }
    }

    try {
      await ChatGptOAuthCredentialStorage.clear();
    } catch (err) {
      logger.warn(
        '[LlmAuthManager] Failed to clear ChatGPT OAuth credentials:',
        err,
      );
    }

    this.effectiveAuthType = undefined;
    this.lastErrorMessage = null;
    this.lastErrorCode = undefined;
    return this.getStatus();
  }

  private mapOAuthError(error: Error): {
    message: string;
    code: OAuthErrorCode;
  } {
    const message = error.message.toLowerCase();

    if (message.includes('timeout') || message.includes('timed out')) {
      return {
        message: 'The sign-in request timed out. Please try again.',
        code: 'timeout',
      };
    }

    if (message.includes('denied') || message.includes('access_denied')) {
      return {
        message:
          'Sign-in was denied. Please try again and grant the requested permissions.',
        code: 'denied',
      };
    }

    if (message.includes('state') && message.includes('mismatch')) {
      return {
        message: 'Security error occurred during sign-in. Please try again.',
        code: 'state_mismatch',
      };
    }

    if (
      message.includes('bind') ||
      message.includes('port') ||
      message.includes('address')
    ) {
      return {
        message:
          'Could not start local server for sign-in. Please check if another application is using the required port.',
        code: 'server_bind_failed',
      };
    }

    if (
      message.includes('token') ||
      message.includes('exchange') ||
      message.includes('authorization code')
    ) {
      return {
        message:
          'Failed to exchange authorization code for access token. Please try again.',
        code: 'token_exchange_failed',
      };
    }

    if (
      message.includes('network') ||
      message.includes('fetch') ||
      message.includes('connection')
    ) {
      return {
        message:
          'Network error occurred. Please check your internet connection and try again.',
        code: 'network_error',
      };
    }

    return {
      message: 'An unexpected error occurred during sign-in. Please try again.',
      code: 'network_error',
    };
  }

  /**
   * T3.2: Apply provider switch from Desktop.
   * Validates enforcedType, applies patches, reconfigures the provider.
   */
  async applyProviderSwitch(params: {
    provider: 'gemini' | 'openai_compatible' | 'openai_chatgpt_oauth';
    openaiCompatible?: {
      baseUrl: string;
      model: string;
      envVarName?: string;
    };
    openaiChatgptOauth?: {
      model: string;
      baseUrl?: string;
      internalModel?: string;
    };
  }): Promise<LlmAuthStatusResult | { error: string; statusCode: number }> {
    const { buildWizardSettingsPatch, LlmProviderId } = await import(
      '@terminai/core'
    );
    const { SettingScope } = await import('../config/settings.js');

    if (!this.getLoadedSettings) {
      return {
        error: 'Provider switching requires a settings loader',
        statusCode: 500,
      };
    }

    const loadedSettings = this.getLoadedSettings();

    // 1. Validate enforcedType
    const enforcedType = loadedSettings.merged.security?.auth?.enforcedType;
    if (enforcedType) {
      return {
        error: `Provider switching is blocked by enforcedType setting (${enforcedType}).`,
        statusCode: 403,
      };
    }

    if (params.provider === 'openai_chatgpt_oauth') {
      const raw = process.env['TERMINAI_DISABLE_OPENAI_CHATGPT_OAUTH'];
      const normalized = raw?.trim().toLowerCase();
      if (
        normalized === '1' ||
        normalized === 'true' ||
        normalized === 'yes' ||
        normalized === 'on'
      ) {
        return {
          error:
            'ChatGPT OAuth provider is disabled by TERMINAI_DISABLE_OPENAI_CHATGPT_OAUTH. Use openai_compatible instead.',
          statusCode: 403,
        };
      }
    }

    // 2. Apply patches via buildWizardSettingsPatch
    const patches = buildWizardSettingsPatch({
      provider: params.provider,
      openaiCompatible: params.openaiCompatible,
      openaiChatgptOauth: params.openaiChatgptOauth,
    });

    const workspaceSettings = loadedSettings.forScope(
      SettingScope.Workspace,
    ).settings;
    const targetScope =
      workspaceSettings.llm?.provider !== undefined ||
      workspaceSettings.llm?.openaiCompatible !== undefined ||
      workspaceSettings.llm?.openaiChatgptOauth !== undefined
        ? SettingScope.Workspace
        : SettingScope.User;

    for (const patch of patches) {
      loadedSettings.setValue(targetScope, patch.path, patch.value);
    }

    // 3. Auth type consistency rules
    const selectedAuthType =
      params.provider === 'openai_compatible'
        ? AuthType.USE_OPENAI_COMPATIBLE
        : params.provider === 'openai_chatgpt_oauth'
          ? AuthType.USE_OPENAI_CHATGPT_OAUTH
          : undefined;

    // Switching to Gemini: clear selectedType if it was OpenAI-compatible
    if (params.provider === 'gemini') {
      const currentSelectedType =
        loadedSettings.merged.security?.auth?.selectedType;
      if (
        currentSelectedType === AuthType.USE_OPENAI_COMPATIBLE ||
        currentSelectedType === AuthType.USE_OPENAI_CHATGPT_OAUTH
      ) {
        loadedSettings.setValue(
          SettingScope.User,
          'security.auth.selectedType',
          undefined,
        );
      }
    }

    // 4. Compute ProviderConfig
    let providerConfig: ProviderConfig;
    if (params.provider === 'openai_compatible' && params.openaiCompatible) {
      const envVarName = (
        params.openaiCompatible.envVarName || 'OPENAI_API_KEY'
      )
        .trim()
        .replace(/\s+/g, '');

      providerConfig = {
        provider: LlmProviderId.OPENAI_COMPATIBLE,
        baseUrl: params.openaiCompatible.baseUrl.trim().replace(/\/+$/, ''),
        model: params.openaiCompatible.model.trim(),
        auth: {
          type: 'bearer' as const,
          envVarName,
          apiKey: process.env[envVarName],
        },
      };
    } else if (
      params.provider === 'openai_chatgpt_oauth' &&
      params.openaiChatgptOauth
    ) {
      const internalModel = params.openaiChatgptOauth.internalModel?.trim();
      providerConfig = {
        provider: LlmProviderId.OPENAI_CHATGPT_OAUTH,
        baseUrl: (
          params.openaiChatgptOauth.baseUrl ??
          'https://chatgpt.com/backend-api/codex'
        )
          .trim()
          .replace(/\/+$/, ''),
        model: params.openaiChatgptOauth.model.trim(),
        internalModel:
          internalModel && internalModel.length > 0 ? internalModel : undefined,
      };
    } else {
      providerConfig = { provider: LlmProviderId.GEMINI };
    }

    // 5. Call reconfigureProvider
    await this.config.reconfigureProvider(providerConfig, selectedAuthType);
    this.effectiveAuthType = selectedAuthType;

    // 6. Return updated status
    return this.getStatus();
  }
}

async function beginOpenAiLoopbackFlow(input: {
  client: ChatGptOAuthClient;
  codeVerifier: string;
  state: string;
  redirectUri: string;
}): Promise<{
  waitForCompletion: Promise<void>;
  cancel: () => void;
  complete: (input: { code: string; state: string }) => Promise<void>;
}> {
  const port = DEFAULT_OPENAI_OAUTH_REDIRECT_PORT;
  const host = '127.0.0.1';

  let server: http.Server | null = null;
  let completed = false;
  let resolved = false;

  let resolveCompletion: (() => void) | null = null;
  let rejectCompletion: ((e: unknown) => void) | null = null;
  const waitForCompletion = new Promise<void>((resolve, reject) => {
    resolveCompletion = () => {
      resolved = true;
      resolve();
    };
    rejectCompletion = reject;
  });

  const timeout = setTimeout(
    () => {
      if (!resolved) {
        rejectCompletion?.(new Error('OAuth timed out'));
        try {
          server?.close();
        } catch {
          // ignore
        }
        server = null;
      }
    },
    5 * 60 * 1000,
  );

  const complete = async (payload: { code: string; state: string }) => {
    if (completed) return;
    completed = true;
    try {
      const creds = await input.client.exchangeAuthorizationCode({
        code: payload.code,
        redirectUri: input.redirectUri,
        codeVerifier: input.codeVerifier,
      });
      await ChatGptOAuthCredentialStorage.save(creds);
      resolveCompletion?.();
    } catch (e) {
      rejectCompletion?.(e);
    } finally {
      clearTimeout(timeout);
      try {
        server?.close();
      } catch {
        // ignore
      }
      server = null;
    }
  };

  const cancel = () => {
    clearTimeout(timeout);
    if (!resolved) {
      rejectCompletion?.(new Error('OAuth cancelled'));
    }
    try {
      server?.close();
    } catch {
      // ignore
    }
    server = null;
  };

  server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', `http://${host}:${port}`);

    if (url.pathname === '/cancel') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('cancelled');
      cancel();
      return;
    }

    if (url.pathname === '/auth/callback') {
      const code = url.searchParams.get('code') ?? '';
      const state = url.searchParams.get('state') ?? '';
      if (!code || !state) {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('missing code/state');
        return;
      }
      if (state !== input.state) {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('state mismatch');
        return;
      }

      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(
        '<!doctype html><meta charset="utf-8"><title>TerminaI</title><p>Authentication complete. You can close this tab.</p>',
      );

      void complete({ code, state });
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('not found');
  });

  await listenWithCancelRetry(server, { host, port });

  return { waitForCompletion, cancel, complete };
}

async function listenWithCancelRetry(
  server: http.Server,
  input: { host: string; port: number },
): Promise<void> {
  const attempts = 10;
  const delayMs = 200;

  for (let i = 0; i < attempts; i++) {
    try {
      await new Promise<void>((resolve, reject) => {
        const onError = (err: unknown) => {
          server.off('error', onError);
          reject(err);
        };
        server.once('error', onError);
        server.listen(input.port, input.host, () => {
          server.off('error', onError);
          resolve();
        });
      });
      return;
    } catch (e: unknown) {
      const code =
        typeof e === 'object' &&
        e !== null &&
        'code' in e &&
        typeof (e as { code?: unknown }).code === 'string'
          ? (e as { code: string }).code
          : '';
      if (code !== 'EADDRINUSE') {
        throw e;
      }
      try {
        await fetch(`http://${input.host}:${input.port}/cancel`).catch(
          () => {},
        );
      } catch {
        // ignore
      }
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  throw new Error(`Failed to bind ${input.host}:${input.port}`);
}

function parseOAuthCompletion(input: {
  redirectUrl?: string;
  code?: string;
  state?: string;
}): { code: string; state: string } | null {
  if (
    typeof input.redirectUrl === 'string' &&
    input.redirectUrl.trim().length > 0
  ) {
    try {
      const url = new URL(input.redirectUrl.trim());
      const code = url.searchParams.get('code') ?? '';
      const state = url.searchParams.get('state') ?? '';
      if (code && state) return { code, state };
      return null;
    } catch {
      return null;
    }
  }

  const code = typeof input.code === 'string' ? input.code.trim() : '';
  const state = typeof input.state === 'string' ? input.state.trim() : '';
  if (!code || !state) return null;
  return { code, state };
}
