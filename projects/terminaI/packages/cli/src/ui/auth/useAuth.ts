/**
 * @license
 * Copyright 2025 Google LLC
 * Portions Copyright 2025 TerminaI Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback } from 'react';
import type { LoadedSettings } from '../../config/settings.js';
import { AuthType, type Config, loadApiKey, debugLogger } from '@terminai/core';
import { getErrorMessage } from '@terminai/core';
import { AuthState } from '../types.js';
import { validateAuthMethod } from '../../config/auth.js';
import { resolveEffectiveAuthType } from '../../config/effectiveAuthType.js';

export function validateAuthMethodWithSettings(
  authType: AuthType,
  settings: LoadedSettings,
): string | null {
  const enforcedType = settings.merged.security?.auth?.enforcedType;
  if (enforcedType && enforcedType !== authType) {
    return `Authentication is enforced to be ${enforcedType}, but you are currently using ${authType}.`;
  }
  if (settings.merged.security?.auth?.useExternal) {
    return null;
  }
  // If using Gemini API key, we don't validate it here as we might need to prompt for it.
  if (authType === AuthType.USE_GEMINI) {
    return null;
  }
  return validateAuthMethod(authType);
}

export const useAuthCommand = (settings: LoadedSettings, config: Config) => {
  const [authState, setAuthState] = useState<AuthState>(
    AuthState.Unauthenticated,
  );

  const [authError, setAuthError] = useState<string | null>(null);
  const [apiKeyDefaultValue, setApiKeyDefaultValue] = useState<
    string | undefined
  >(undefined);

  const onAuthError = useCallback(
    (error: string | null) => {
      setAuthError(error);
      if (error) {
        setAuthState(AuthState.Updating);
      }
    },
    [setAuthError, setAuthState],
  );

  const reloadApiKey = useCallback(async () => {
    const envKey = process.env['GEMINI_API_KEY'];
    if (envKey !== undefined) {
      setApiKeyDefaultValue(envKey);
      return envKey;
    }

    const storedKey = (await loadApiKey()) ?? '';
    setApiKeyDefaultValue(storedKey);
    return storedKey;
  }, []);

  useEffect(() => {
    if (authState === AuthState.AwaitingApiKeyInput) {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      reloadApiKey();
    }
  }, [authState, reloadApiKey]);

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    (async () => {
      if (authState !== AuthState.Unauthenticated) {
        return;
      }

      const effectiveAuthType = resolveEffectiveAuthType(settings.merged);
      if (!effectiveAuthType) {
        if (process.env['GEMINI_API_KEY']) {
          onAuthError(
            'Existing API key detected (GEMINI_API_KEY). Select "Gemini API Key" option to use it, or run /auth to switch providers.',
          );
        } else {
          onAuthError(
            'No authentication method selected. Run /auth to set up.',
          );
        }
        return;
      }

      if (effectiveAuthType === AuthType.USE_GEMINI) {
        const key = await reloadApiKey(); // Use the unified function
        if (!key) {
          setAuthState(AuthState.AwaitingApiKeyInput);
          return;
        }
      }

      const error = validateAuthMethodWithSettings(effectiveAuthType, settings);
      if (error) {
        onAuthError(error);
        return;
      }

      const defaultAuthType = process.env['GEMINI_DEFAULT_AUTH_TYPE'];
      if (
        defaultAuthType &&
        !Object.values(AuthType).includes(defaultAuthType as AuthType)
      ) {
        onAuthError(
          `Invalid value for GEMINI_DEFAULT_AUTH_TYPE: "${defaultAuthType}". ` +
            `Valid values are: ${Object.values(AuthType).join(', ')}.`,
        );
        return;
      }

      try {
        await config.refreshAuth(effectiveAuthType);

        debugLogger.log(`Authenticated via "${effectiveAuthType}".`);
        setAuthError(null);
        setAuthState(AuthState.Authenticated);
      } catch (e) {
        onAuthError(`Failed to login. Message: ${getErrorMessage(e)}`);
      }
    })();
  }, [
    settings,
    config,
    authState,
    setAuthState,
    setAuthError,
    onAuthError,
    reloadApiKey,
  ]);

  return {
    authState,
    setAuthState,
    authError,
    onAuthError,
    apiKeyDefaultValue,
    reloadApiKey,
  };
};
