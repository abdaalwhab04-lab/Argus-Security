/**
 * @license
 * Copyright 2025 Google LLC
 * Portions Copyright 2025 TerminaI Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import process from 'node:process';
import {
  LlmProviderId,
  type ProviderConfig,
  type OpenAICompatibleConfig,
  FatalConfigError,
} from '@terminai/core';
import type { Settings } from './settings.js';

export interface SettingsToProviderConfigOptions {
  modelOverride?: string;
}

/**
 * Converts settings to a ProviderConfig.
 * This logic is extracted from config.ts to be reusable for runtime reconfiguration.
 */
export function settingsToProviderConfig(
  settings: Settings,
  options: SettingsToProviderConfigOptions = {},
): { providerConfig: ProviderConfig; resolvedModel?: string } {
  let providerConfig: ProviderConfig = { provider: LlmProviderId.GEMINI };
  let resolvedModel: string | undefined;

  if (settings.llm?.provider === 'openai_compatible') {
    const s = settings.llm.openaiCompatible;
    if (!s) {
      throw new FatalConfigError(
        'llm.provider is set to openai_compatible, but llm.openaiCompatible is missing.',
      );
    }
    const baseUrl = normalizeOpenAIBaseUrl(s?.baseUrl);
    const openaiModel = (options.modelOverride ?? s?.model ?? '').trim();
    if (baseUrl && openaiModel.length > 0) {
      // Type the auth object based on the settings schema
      const auth = s.auth as
        | { type?: 'none' | 'api-key' | 'bearer'; envVarName?: string }
        | undefined;

      const envVarName = (auth?.envVarName ?? 'OPENAI_API_KEY')
        .trim()
        .replace(/\s+/g, '');

      let authType: NonNullable<OpenAICompatibleConfig['auth']>['type'] =
        'none';
      if (auth?.type === 'none') authType = 'none';
      else if (auth?.type === 'api-key') authType = 'api-key';
      else if (auth?.type === 'bearer') authType = 'bearer';
      else if (envVarName && process.env[envVarName]) authType = 'bearer';

      const headers: Record<string, string> = {};
      if (settings.llm.headers) {
        for (const [k, v] of Object.entries(settings.llm.headers)) {
          if (typeof v === 'string') headers[k] = v;
        }
      }

      providerConfig = {
        provider: LlmProviderId.OPENAI_COMPATIBLE,
        baseUrl,
        model: openaiModel,
        auth: {
          type: authType,
          apiKey: undefined,
          envVarName,
        },
        headers,
      };

      // Resolve API Key here if env var name is provided
      if (
        providerConfig.provider === LlmProviderId.OPENAI_COMPATIBLE &&
        envVarName &&
        process.env[envVarName]
      ) {
        providerConfig.auth!.apiKey = process.env[envVarName];
      }

      resolvedModel = openaiModel;
    } else {
      throw new FatalConfigError(
        'llm.provider is set to openai_compatible, but llm.openaiCompatible.baseUrl and a model (llm.openaiCompatible.model or --model) are required.',
      );
    }
  } else if (settings.llm?.provider === 'openai_chatgpt_oauth') {
    const s = settings.llm.openaiChatgptOauth;
    if (!s) {
      throw new FatalConfigError(
        'llm.provider is set to openai_chatgpt_oauth, but llm.openaiChatgptOauth is missing.',
      );
    }

    const baseUrl =
      normalizeOpenAIBaseUrl(s?.baseUrl) ??
      'https://chatgpt.com/backend-api/codex';
    const model = (options.modelOverride ?? s?.model ?? '').trim();
    if (model.length === 0) {
      throw new FatalConfigError(
        'llm.provider is set to openai_chatgpt_oauth, but llm.openaiChatgptOauth.model (or --model) is required.',
      );
    }

    const headers: Record<string, string> = {};
    if (settings.llm.headers) {
      for (const [k, v] of Object.entries(settings.llm.headers)) {
        if (typeof v === 'string') headers[k] = v;
      }
    }

    const internalModel = (s?.internalModel ?? '').trim();

    providerConfig = {
      provider: LlmProviderId.OPENAI_CHATGPT_OAUTH,
      baseUrl,
      model,
      internalModel: internalModel.length > 0 ? internalModel : undefined,
      headers,
    };

    resolvedModel = model;
  } else if (settings.llm?.provider === 'anthropic') {
    providerConfig = { provider: LlmProviderId.ANTHROPIC };
  }

  return { providerConfig, resolvedModel };
}

function normalizeOpenAIBaseUrl(raw: string | undefined): string | undefined {
  if (typeof raw !== 'string') {
    return undefined;
  }

  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return undefined;
  }

  const withScheme = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  return withScheme.replace(/\/+$/, '');
}
