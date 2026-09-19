/**
 * @license
 * Copyright 2025 Google LLC
 * Portions Copyright 2025 TerminaI Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AuthClient } from './authClient';
import { createAuthClient } from './authClient';

// Mock fetch
global.fetch = vi.fn();

describe('AuthClient', () => {
  const baseUrl = 'http://localhost:8080';
  const token = 'test-token';
  let client: AuthClient;

  beforeEach(() => {
    vi.resetAllMocks();
    client = createAuthClient(baseUrl, token);
  });

  describe('switchProvider', () => {
    it('should call /auth/provider with correct params', async () => {
      const mockResponse = { status: 'ok', message: 'Switched' };
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const params = {
        provider: 'openai_compatible' as const,
        openaiCompatible: {
          baseUrl: 'https://api.example.com',
          model: 'gpt-4',
          envVarName: 'MY_KEY',
        },
      };

      const result = await client.switchProvider(params);

      expect(global.fetch).toHaveBeenCalledWith(
        `${baseUrl}/auth/provider`,
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            // AuthClient uses buildSignedHeaders() which adds signature headers, not Bearer token
          }),
          body: JSON.stringify(params),
        }),
      );
      expect(result).toEqual(mockResponse);
    });

    it('should switch to ChatGPT OAuth provider', async () => {
      const mockResponse = { status: 'required', message: 'Needs OAuth' };
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const params = {
        provider: 'openai_chatgpt_oauth' as const,
        openaiChatgptOauth: {
          model: 'gpt-5.2-codex',
          baseUrl: 'https://chatgpt.com/backend-api/codex',
        },
      };

      const result = await client.switchProvider(params);

      expect(global.fetch).toHaveBeenCalledWith(
        `${baseUrl}/auth/provider`,
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(params),
        }),
      );
      expect(result).toEqual(mockResponse);
    });

    it('should throw on error', async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: async () => 'Method Not Allowed',
        json: async () => ({ error: 'Method Not Allowed' }),
      } as Response);

      await expect(
        client.switchProvider({ provider: 'gemini' }),
      ).rejects.toThrow('Auth request failed (500): Method Not Allowed');
    });
  });

  it('setApiKey posts to /auth/gemini/api-key', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'ok' }),
    } as Response);

    await client.setApiKey('test-key');

    expect(global.fetch).toHaveBeenCalledWith(
      `${baseUrl}/auth/gemini/api-key`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ apiKey: 'test-key' }),
      }),
    );
  });

  it('startOAuth posts to /auth/gemini/oauth/start', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ authUrl: 'https://example.com/auth' }),
    } as Response);

    await client.startOAuth();

    expect(global.fetch).toHaveBeenCalledWith(
      `${baseUrl}/auth/gemini/oauth/start`,
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('startOpenAIOAuth posts to /auth/openai/oauth/start', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ authUrl: 'https://example.com/auth' }),
    } as Response);

    await client.startOpenAIOAuth();

    expect(global.fetch).toHaveBeenCalledWith(
      `${baseUrl}/auth/openai/oauth/start`,
      expect.objectContaining({ method: 'POST' }),
    );
  });
});
