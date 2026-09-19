/**
 * @license
 * Copyright 2025 Google LLC
 * Portions Copyright 2025 TerminaI Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { AuthType } from '@terminai/core';
import { loadEnvironment, loadSettings } from './settings.js';

export function validateAuthMethod(authMethod: string): string | null {
  const loadedSettings = loadSettings();
  loadEnvironment(loadedSettings.merged);
  const mergedSettings = loadedSettings.merged;
  if (
    authMethod === AuthType.LOGIN_WITH_GOOGLE ||
    authMethod === AuthType.COMPUTE_ADC
  ) {
    return null;
  }

  if (authMethod === AuthType.USE_OPENAI_COMPATIBLE) {
    if (mergedSettings.llm?.provider !== 'openai_compatible') {
      return (
        'OpenAI-compatible auth is selected, but llm.provider is not set to "openai_compatible".\n' +
        'Run /auth wizard to configure your provider and try again.'
      );
    }

    const openai = mergedSettings.llm?.openaiCompatible;
    const baseUrl = openai?.baseUrl?.trim() ?? '';
    const model = openai?.model?.trim() ?? '';
    if (baseUrl.length === 0 || model.length === 0) {
      return (
        'OpenAI-compatible provider is selected, but configuration is incomplete.\n' +
        'Required settings:\n' +
        '• llm.openaiCompatible.baseUrl\n' +
        '• llm.openaiCompatible.model\n' +
        'Run /auth wizard to configure these values.'
      );
    }
    if (!/^https?:\/\//i.test(baseUrl)) {
      return (
        'OpenAI-compatible base URL must start with http:// or https://.\n' +
        `Current value: "${openai?.baseUrl ?? ''}"\n` +
        'Run /auth wizard to fix it.'
      );
    }

    const auth = openai?.auth;
    if (
      auth?.type !== undefined &&
      auth.type !== 'none' &&
      auth.type !== 'api-key' &&
      auth.type !== 'bearer'
    ) {
      return (
        'Invalid llm.openaiCompatible.auth.type.\n' +
        'Valid values: "none", "bearer", "api-key".'
      );
    }
    const authType = auth?.type ?? 'none';

    const envVarName = (auth?.envVarName ?? 'OPENAI_API_KEY')
      .trim()
      .replace(/\s+/g, '');

    if (authType !== 'none' && !process.env[envVarName]) {
      return (
        `Missing API key for OpenAI-compatible provider. Set ${envVarName} and restart TerminaI (or re-run /auth wizard).\n` +
        `Example: export ${envVarName}='sk-...'`
      );
    }

    return null;
  }

  if (authMethod === AuthType.USE_OPENAI_CHATGPT_OAUTH) {
    if (mergedSettings.llm?.provider !== 'openai_chatgpt_oauth') {
      return (
        'ChatGPT OAuth auth is selected, but llm.provider is not set to "openai_chatgpt_oauth".\n' +
        'Run /auth wizard to configure your provider and try again.'
      );
    }

    const openai = mergedSettings.llm?.openaiChatgptOauth;
    const baseUrl = openai?.baseUrl?.trim() ?? '';
    const model = openai?.model?.trim() ?? '';
    if (model.length === 0) {
      return (
        'ChatGPT OAuth provider is selected, but configuration is incomplete.\n' +
        'Required settings:\n' +
        '• llm.openaiChatgptOauth.model\n' +
        'Run /auth wizard to configure these values.'
      );
    }
    if (baseUrl.length > 0 && !/^https?:\/\//i.test(baseUrl)) {
      return (
        'ChatGPT OAuth base URL must start with http:// or https://.\n' +
        `Current value: "${openai?.baseUrl ?? ''}"\n` +
        'Run /auth wizard to fix it.'
      );
    }

    return null;
  }

  if (authMethod === AuthType.USE_GEMINI) {
    if (!process.env['GEMINI_API_KEY']) {
      return (
        'When using Gemini API, you must specify the GEMINI_API_KEY environment variable.\n' +
        'Update your environment and try again (no reload needed if using .env)!'
      );
    }
    return null;
  }

  if (authMethod === AuthType.USE_VERTEX_AI) {
    const hasVertexProjectLocationConfig =
      !!process.env['GOOGLE_CLOUD_PROJECT'] &&
      !!process.env['GOOGLE_CLOUD_LOCATION'];
    const hasGoogleApiKey = !!process.env['GOOGLE_API_KEY'];
    if (!hasVertexProjectLocationConfig && !hasGoogleApiKey) {
      return (
        'When using Vertex AI, you must specify either:\n' +
        '• GOOGLE_CLOUD_PROJECT and GOOGLE_CLOUD_LOCATION environment variables.\n' +
        '• GOOGLE_API_KEY environment variable (if using express mode).\n' +
        'Update your environment and try again (no reload needed if using .env)!'
      );
    }
    return null;
  }

  return 'Invalid auth method selected.';
}
