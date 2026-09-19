/**
 * @license
 * Copyright 2025 Google LLC
 * Portions Copyright 2025 TerminaI Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AuthType,
  LlmProviderId,
  type Config,
  type LoadedSettings,
} from '@terminai/core';
import { AuthConflictError, LlmAuthManager } from './llmAuthManager.js';

const mockCheck = vi.hoisted(() => vi.fn());
const mockBeginFlow = vi.hoisted(() => vi.fn());
const mockSaveApiKey = vi.hoisted(() => vi.fn());

vi.mock('@terminai/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@terminai/core')>();
  return {
    ...actual,
    checkGeminiAuthStatusNonInteractive: mockCheck,
    beginGeminiOAuthLoopbackFlow: mockBeginFlow,
    saveApiKey: mockSaveApiKey,
    buildWizardSettingsPatch: vi.fn(),
    LlmProviderId: {
      GEMINI: 'gemini',
      OPENAI_COMPATIBLE: 'openai_compatible',
      OPENAI_CHATGPT_OAUTH: 'openai_chatgpt_oauth',
      ANTHROPIC: 'anthropic',
    },
  };
});

vi.mock('../config/settings.js', () => ({
  SettingScope: { User: 1, Workspace: 2 },
}));

describe('LlmAuthManager', () => {
  let mockConfig: Config;

  beforeEach(() => {
    mockConfig = {
      // Config is heavyweight; we only need refreshAuth for these unit tests.
      refreshAuth: vi.fn().mockResolvedValue(undefined),
      getProxy: vi.fn().mockReturnValue(undefined),
      getProviderConfig: vi.fn().mockReturnValue({ provider: 'gemini' }),
      reconfigureProvider: vi.fn().mockResolvedValue(undefined),
    } as unknown as Config;

    mockCheck.mockResolvedValue({ status: 'required' });
    mockSaveApiKey.mockResolvedValue(undefined);

    delete process.env['GOOGLE_CLOUD_PROJECT'];
    delete process.env['GOOGLE_CLOUD_LOCATION'];
    delete process.env['GOOGLE_API_KEY'];
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('reports in_progress after starting OAuth', async () => {
    const waitForCompletion = new Promise<void>(() => {});
    const cancel = vi.fn();
    mockBeginFlow.mockResolvedValue({
      authUrl: 'https://example.test/auth',
      waitForCompletion,
      cancel,
    });

    const manager = new LlmAuthManager({
      config: mockConfig,
      getSelectedAuthType: () => AuthType.LOGIN_WITH_GOOGLE,
    });

    const start = await manager.startGeminiOAuth();
    expect(start.authUrl).toBe('https://example.test/auth');

    const status = await manager.getStatus();
    expect(status.status).toBe('in_progress');
    expect(status.authType).toBe(AuthType.LOGIN_WITH_GOOGLE);
  });

  it('prevents starting a second OAuth flow concurrently', async () => {
    const waitForCompletion = new Promise<void>(() => {});
    mockBeginFlow.mockResolvedValue({
      authUrl: 'https://example.test/auth',
      waitForCompletion,
      cancel: vi.fn(),
    });

    const manager = new LlmAuthManager({
      config: mockConfig,
      getSelectedAuthType: () => AuthType.LOGIN_WITH_GOOGLE,
    });

    await manager.startGeminiOAuth();
    await expect(manager.startGeminiOAuth()).rejects.toBeInstanceOf(
      AuthConflictError,
    );
  });

  it('submits Gemini API key via keychain and refreshAuth', async () => {
    mockCheck.mockResolvedValue({ status: 'ok' });

    const manager = new LlmAuthManager({
      config: mockConfig,
      getSelectedAuthType: () => AuthType.USE_GEMINI,
    });

    const status = await manager.submitGeminiApiKey('  test-key  ');
    expect(mockSaveApiKey).toHaveBeenCalledWith('test-key');
    expect(mockConfig.refreshAuth).toHaveBeenCalledWith(AuthType.USE_GEMINI);
    expect(status.status).toBe('ok');
  });

  it('returns required for Vertex when env is missing', async () => {
    const manager = new LlmAuthManager({
      config: mockConfig,
      getSelectedAuthType: () => AuthType.USE_VERTEX_AI,
    });

    const status = await manager.useGeminiVertex();
    expect(status.status).toBe('required');
    expect(status.authType).toBe(AuthType.USE_VERTEX_AI);
  });

  it('getStatus checks env var for OpenAI-compatible provider', async () => {
    vi.mocked(mockConfig.getProviderConfig).mockReturnValue({
      provider: LlmProviderId.OPENAI_COMPATIBLE,
      baseUrl: 'http://localhost:1234',
      model: 'gpt-4o',
      auth: { type: 'api-key', envVarName: 'MY_OPENAI_KEY' },
    } as unknown as ReturnType<Config['getProviderConfig']>);

    const manager = new LlmAuthManager({
      config: mockConfig,
      getSelectedAuthType: () => AuthType.USE_OPENAI_COMPATIBLE,
    });

    // Env var missing
    delete process.env['MY_OPENAI_KEY'];
    let status = await manager.getStatus();
    expect(status.status).toBe('required');
    expect(status.message).toContain('MY_OPENAI_KEY');

    // Env var present
    process.env['MY_OPENAI_KEY'] = 'sk-test';
    status = await manager.getStatus();
    expect(status.status).toBe('ok');
    expect(status.authType).toBe(AuthType.USE_OPENAI_COMPATIBLE);
    // 3.5 Test: Verify provider field is returned
    expect(status.provider).toBe('openai_compatible');
  });

  it('getStatus includes provider field for Gemini (3.5 fix)', async () => {
    mockCheck.mockResolvedValue({ status: 'ok' });

    const manager = new LlmAuthManager({
      config: mockConfig,
      getSelectedAuthType: () => AuthType.USE_GEMINI,
    });

    const status = await manager.getStatus();
    expect(status.status).toBe('ok');
    expect(status.provider).toBe('gemini');
  });

  describe('applyProviderSwitch', () => {
    let mockLoadedSettings: {
      merged: { security: { auth: Record<string, unknown> } };
      setValue: unknown;
      forScope: unknown;
    };

    beforeEach(() => {
      mockLoadedSettings = {
        merged: { security: { auth: {} } },
        setValue: vi.fn(),
        forScope: vi.fn(() => ({ settings: {} })),
      };
    });

    it('blocks if enforcedType is set', async () => {
      mockLoadedSettings.merged.security.auth['enforcedType'] = 'USE_API_KEY';
      const manager = new LlmAuthManager({
        config: mockConfig,
        getSelectedAuthType: () => undefined,
        getLoadedSettings: () =>
          mockLoadedSettings as unknown as LoadedSettings,
      });

      const result = await manager.applyProviderSwitch({ provider: 'gemini' });
      expect(result).toHaveProperty('statusCode', 403);
      expect(result).toHaveProperty(
        'error',
        expect.stringContaining('enforcedType'),
      );
    });

    it('blocks ChatGPT OAuth provider when disabled by env var', async () => {
      process.env['TERMINAI_DISABLE_OPENAI_CHATGPT_OAUTH'] = '1';
      const { buildWizardSettingsPatch } = await import('@terminai/core');

      const manager = new LlmAuthManager({
        config: mockConfig,
        getSelectedAuthType: () => undefined,
        getLoadedSettings: () =>
          mockLoadedSettings as unknown as LoadedSettings,
      });

      const result = await manager.applyProviderSwitch({
        provider: 'openai_chatgpt_oauth',
        openaiChatgptOauth: {
          baseUrl: 'https://chatgpt.com/backend-api/codex',
          model: 'gpt-5.2-codex',
        },
      });

      expect(result).toEqual({
        error:
          'ChatGPT OAuth provider is disabled by TERMINAI_DISABLE_OPENAI_CHATGPT_OAUTH. Use openai_compatible instead.',
        statusCode: 403,
      });
      expect(buildWizardSettingsPatch).not.toHaveBeenCalled();
      expect(mockLoadedSettings.setValue).not.toHaveBeenCalled();

      delete process.env['TERMINAI_DISABLE_OPENAI_CHATGPT_OAUTH'];
    });

    it('applies patches and reconfigures provider', async () => {
      const { buildWizardSettingsPatch } = await import('@terminai/core');
      vi.mocked(buildWizardSettingsPatch).mockReturnValue([
        { path: 'test.path', value: 'test-value' },
        {
          path: 'security.auth.selectedType',
          value: AuthType.USE_OPENAI_COMPATIBLE,
        },
      ]);

      const manager = new LlmAuthManager({
        config: mockConfig,
        getSelectedAuthType: () => undefined,
        getLoadedSettings: () =>
          mockLoadedSettings as unknown as LoadedSettings,
      });

      // Mock getStatus to return OK so we can verify the full flow
      manager.getStatus = vi.fn().mockResolvedValue({ status: 'ok' });

      await manager.applyProviderSwitch({
        provider: 'openai_compatible',
        openaiCompatible: {
          baseUrl: 'http://test',
          model: 'gpt-4',
          envVarName: 'TEST_KEY',
        },
      });

      // Check patches applied
      expect(mockLoadedSettings.setValue).toHaveBeenCalledWith(
        expect.anything(),
        'test.path',
        'test-value',
      );

      // Check consistency (selectedType set for OpenAI)
      expect(mockLoadedSettings.setValue).toHaveBeenCalledWith(
        expect.anything(),
        'security.auth.selectedType',
        AuthType.USE_OPENAI_COMPATIBLE,
      );

      // Check reconfigure called
      expect(mockConfig.reconfigureProvider).toHaveBeenCalledWith(
        expect.objectContaining({ provider: 'openai_compatible' }),
        AuthType.USE_OPENAI_COMPATIBLE,
      );
    });

    it('writes provider patches to Workspace when workspace overrides exist', async () => {
      const { buildWizardSettingsPatch } = await import('@terminai/core');
      vi.mocked(buildWizardSettingsPatch).mockReturnValue([
        { path: 'llm.provider', value: 'openai_chatgpt_oauth' },
      ]);

      const manager = new LlmAuthManager({
        config: mockConfig,
        getSelectedAuthType: () => undefined,
        getLoadedSettings: () =>
          ({
            ...mockLoadedSettings,
            forScope: () => ({
              settings: { llm: { provider: 'gemini' } },
            }),
          }) as unknown as LoadedSettings,
      });

      manager.getStatus = vi.fn().mockResolvedValue({ status: 'ok' });

      await manager.applyProviderSwitch({
        provider: 'openai_chatgpt_oauth',
        openaiChatgptOauth: { model: 'gpt-5.2-codex' },
      });

      expect(mockLoadedSettings.setValue).toHaveBeenCalledWith(
        2,
        'llm.provider',
        'openai_chatgpt_oauth',
      );
    });
  });
});
