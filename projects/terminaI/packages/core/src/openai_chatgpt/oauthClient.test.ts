/**
 * @license
 * Copyright 2025 Google LLC
 * Portions Copyright 2025 TerminaI Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  CHATGPT_ACCOUNT_ID_CLAIM,
  CODEX_ORIGINATOR,
  DEFAULT_OPENAI_OAUTH_AUTHORIZE_URL,
  DEFAULT_OPENAI_OAUTH_TOKEN_URL,
  OPENAI_AUTH_CLAIM,
} from './constants.js';
import { ChatGptOAuthClient } from './oauthClient.js';

function jwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'none' })).toString(
    'base64url',
  );
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${header}.${body}.`;
}

describe('ChatGptOAuthClient', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    global.fetch = vi.fn();
  });

  it('builds auth URL with Codex CLI params', () => {
    const client = new ChatGptOAuthClient({
      clientId: 'client123',
      authorizeUrl: DEFAULT_OPENAI_OAUTH_AUTHORIZE_URL,
    });

    const start = client.startAuthorization({
      redirectUri: 'http://localhost:1455/auth/callback',
    });

    const url = new URL(start.authUrl);
    expect(url.origin + url.pathname).toBe(DEFAULT_OPENAI_OAUTH_AUTHORIZE_URL);
    expect(url.searchParams.get('client_id')).toBe('client123');
    expect(url.searchParams.get('redirect_uri')).toBe(
      'http://localhost:1455/auth/callback',
    );
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('scope')).toContain('offline_access');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('state')).toBeTruthy();
    expect(url.searchParams.get('originator')).toBe(CODEX_ORIGINATOR);
    expect(url.searchParams.get('codex_cli_simplified_flow')).toBe('true');
    expect(url.searchParams.get('id_token_add_organizations')).toBe('true');
    expect(start.codeVerifier.length).toBeGreaterThan(10);
  });

  it('exchanges code with x-www-form-urlencoded body', async () => {
    const client = new ChatGptOAuthClient({
      clientId: 'client123',
      tokenUrl: DEFAULT_OPENAI_OAUTH_TOKEN_URL,
    });

    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: 'access',
        refresh_token: 'refresh',
        token_type: 'Bearer',
        id_token: jwt({
          [OPENAI_AUTH_CLAIM]: { chatgpt_account_id: 'acct_test' },
        }),
      }),
    } as Response);

    await client.exchangeAuthorizationCode({
      code: 'code123',
      redirectUri: 'http://localhost:1455/auth/callback',
      codeVerifier: 'verifier123',
    });

    expect(global.fetch).toHaveBeenCalledWith(
      DEFAULT_OPENAI_OAUTH_TOKEN_URL,
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: expect.stringContaining('grant_type=authorization_code'),
      }),
    );

    const init = vi.mocked(global.fetch).mock.calls[0]?.[1];
    const body = init?.body;
    if (typeof body !== 'string') throw new Error('Expected string body');
    expect(body).toContain('code=code123');
    expect(body).toContain('redirect_uri=');
    expect(body).toContain('client_id=client123');
    expect(body).toContain('code_verifier=verifier123');
  });

  it('refreshes tokens with JSON body and scope without offline_access', async () => {
    const client = new ChatGptOAuthClient({
      clientId: 'client123',
      tokenUrl: DEFAULT_OPENAI_OAUTH_TOKEN_URL,
    });

    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: 'access2',
        refresh_token: 'refresh2',
        token_type: 'Bearer',
        id_token: jwt({
          [OPENAI_AUTH_CLAIM]: { chatgpt_account_id: 'acct_test' },
        }),
      }),
    } as Response);

    await client.refresh({ refreshToken: 'refresh' });

    expect(global.fetch).toHaveBeenCalledWith(
      DEFAULT_OPENAI_OAUTH_TOKEN_URL,
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: expect.stringContaining('"grant_type":"refresh_token"'),
      }),
    );

    const init = vi.mocked(global.fetch).mock.calls[0]?.[1];
    const rawBody = init?.body;
    if (typeof rawBody !== 'string') throw new Error('Expected string body');

    const body = JSON.parse(rawBody) as Record<string, unknown>;
    expect(body['scope']).toBe('openid profile email');
  });

  it('derives account id from id token claim', () => {
    const client = new ChatGptOAuthClient();
    const token = jwt({
      [OPENAI_AUTH_CLAIM]: { chatgpt_account_id: 'acct_123' },
    });
    expect(client.deriveAccountId({ idToken: token })).toBe('acct_123');
  });

  it('derives account id from legacy flat claim', () => {
    const client = new ChatGptOAuthClient();
    const token = jwt({ [CHATGPT_ACCOUNT_ID_CLAIM]: 'acct_legacy' });
    expect(client.deriveAccountId({ accessToken: token })).toBe('acct_legacy');
  });

  it('throws when exchange code returns token without account id', async () => {
    const client = new ChatGptOAuthClient({
      clientId: 'client123',
      tokenUrl: DEFAULT_OPENAI_OAUTH_TOKEN_URL,
    });

    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: 'access_no_acct',
        refresh_token: 'refresh',
        token_type: 'Bearer',
        id_token: jwt({ sub: 'no_account_id' }), // No account ID claim
      }),
    } as Response);

    await expect(
      client.exchangeAuthorizationCode({
        code: 'code123',
        redirectUri: 'uri',
        codeVerifier: 'verifier',
      }),
    ).rejects.toThrow('ChatGPT OAuth account id is missing');
  });
});
