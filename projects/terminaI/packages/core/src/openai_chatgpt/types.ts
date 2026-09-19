/**
 * @license
 * Copyright 2025 Google LLC
 * Portions Copyright 2025 TerminaI Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { OAuthCredentials } from '../mcp/token-storage/types.js';

export interface OpenAIOAuthTokenResponse {
  readonly access_token: string;
  readonly token_type: string;
  readonly refresh_token?: string;
  readonly id_token?: string;
  readonly expires_in?: number;
  readonly scope?: string;
}

export interface ChatGptOAuthStoredCredentials extends OAuthCredentials {
  readonly credentialType: 'openai-chatgpt';
  readonly idToken?: string;
  readonly accountId?: string;
  readonly lastRefresh?: number;
}

export interface ChatGptOAuthTokens {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly tokenType: 'Bearer';
  readonly idToken?: string;
  readonly expiresAt?: number;
  readonly scope?: string;
}

export interface ChatGptOAuthCredentialPayload {
  readonly token: ChatGptOAuthTokens;
  readonly accountId?: string;
  readonly lastRefresh?: number;
}
