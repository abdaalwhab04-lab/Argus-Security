/**
 * @license
 * Copyright 2025 Google LLC
 * Portions Copyright 2025 TerminaI Authors
 * SPDX-License-Identifier: Apache-2.0
 */

export const OPENAI_CHATGPT_OAUTH_PROVIDER_ID = 'openai_chatgpt_oauth' as const;

export const OPENAI_CHATGPT_TOKEN_STORAGE_SERVICE =
  'terminai-openai-chatgpt' as const;
export const OPENAI_CHATGPT_TOKEN_STORAGE_SERVER_NAME =
  'openai-chatgpt' as const;
export const OPENAI_CHATGPT_CREDENTIAL_TYPE = 'openai-chatgpt' as const;

export const DEFAULT_CHATGPT_CODEX_BASE_URL =
  'https://chatgpt.com/backend-api/codex' as const;
export const CHATGPT_CODEX_RESPONSES_PATH = 'responses' as const;

export const DEFAULT_OPENAI_OAUTH_CLIENT_ID =
  'app_EMoamEEZ73f0CkXaXp7hrann' as const;
export const DEFAULT_OPENAI_OAUTH_AUTHORIZE_URL =
  'https://auth.openai.com/oauth/authorize' as const;
export const DEFAULT_OPENAI_OAUTH_TOKEN_URL =
  'https://auth.openai.com/oauth/token' as const;

export const DEFAULT_OPENAI_OAUTH_REDIRECT_PORT = 1455 as const;
export const DEFAULT_REFRESH_STALE_MS = 8 * 60 * 1000;

// Legacy (older plugins/docs) — some JWTs used to expose this as a flat claim.
export const CHATGPT_ACCOUNT_ID_CLAIM =
  'https://api.openai.com/auth.chatgpt_account_id' as const;

// Codex CLI / OpenAI tokens expose auth details as a nested object claim.
export const OPENAI_AUTH_CLAIM = 'https://api.openai.com/auth' as const;
export const OPENAI_AUTH_CHATGPT_ACCOUNT_ID_FIELD =
  'chatgpt_account_id' as const;
export const CODEX_ORIGINATOR = 'codex_cli_rs' as const;

export const OPENAI_CHATGPT_OAUTH_DISABLE_ENV =
  'TERMINAI_DISABLE_OPENAI_CHATGPT_OAUTH' as const;

export function isOpenAIChatGptOauthProviderDisabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const raw = env[OPENAI_CHATGPT_OAUTH_DISABLE_ENV];
  if (raw === undefined) return false;

  const normalized = raw.trim().toLowerCase();
  return (
    normalized === '1' ||
    normalized === 'true' ||
    normalized === 'yes' ||
    normalized === 'on'
  );
}
