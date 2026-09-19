/**
 * @license
 * Copyright 2025 Google LLC
 * Portions Copyright 2025 TerminaI Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  OPENAI_CHATGPT_CREDENTIAL_TYPE,
  OPENAI_CHATGPT_TOKEN_STORAGE_SERVER_NAME,
} from './constants.js';

const mockHybridTokenStorage = vi.hoisted(() => ({
  getCredentials: vi.fn(),
  setCredentials: vi.fn(),
  deleteCredentials: vi.fn(),
}));

vi.mock('../mcp/token-storage/hybrid-token-storage.js', () => ({
  HybridTokenStorage: vi.fn(() => mockHybridTokenStorage),
}));

import { ChatGptOAuthCredentialStorage } from './credentialStorage.js';

describe('ChatGptOAuthCredentialStorage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('saves credentials with discriminator', async () => {
    await ChatGptOAuthCredentialStorage.save({
      token: {
        accessToken: 'access',
        refreshToken: 'refresh',
        tokenType: 'Bearer',
        idToken: 'id',
      },
      accountId: 'acct',
      lastRefresh: 123,
    });

    expect(mockHybridTokenStorage.setCredentials).toHaveBeenCalledWith(
      expect.objectContaining({
        serverName: OPENAI_CHATGPT_TOKEN_STORAGE_SERVER_NAME,
        credentialType: OPENAI_CHATGPT_CREDENTIAL_TYPE,
        accountId: 'acct',
        lastRefresh: 123,
        token: expect.objectContaining({
          accessToken: 'access',
          refreshToken: 'refresh',
          tokenType: 'Bearer',
        }),
      }),
    );
  });

  it('loads and validates discriminator', async () => {
    mockHybridTokenStorage.getCredentials.mockResolvedValue({
      serverName: OPENAI_CHATGPT_TOKEN_STORAGE_SERVER_NAME,
      updatedAt: 1,
      credentialType: OPENAI_CHATGPT_CREDENTIAL_TYPE,
      token: {
        accessToken: 'access',
        refreshToken: 'refresh',
        tokenType: 'Bearer',
      },
    });

    const creds = await ChatGptOAuthCredentialStorage.load();
    expect(creds?.token.accessToken).toBe('access');
  });

  it('throws if discriminator mismatches', async () => {
    mockHybridTokenStorage.getCredentials.mockResolvedValue({
      serverName: OPENAI_CHATGPT_TOKEN_STORAGE_SERVER_NAME,
      updatedAt: 1,
      credentialType: 'other',
      token: {
        accessToken: 'access',
        refreshToken: 'refresh',
        tokenType: 'Bearer',
      },
    });

    await expect(ChatGptOAuthCredentialStorage.load()).rejects.toThrow(
      'Failed to load ChatGPT OAuth credentials',
    );
  });
});
