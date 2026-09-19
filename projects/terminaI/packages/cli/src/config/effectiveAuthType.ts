/**
 * @license
 * Copyright 2025 Google LLC
 * Portions Copyright 2025 TerminaI Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { AuthType } from '@terminai/core';
import type { Settings } from './settings.js';

const GEMINI_AUTH_TYPES = new Set<AuthType>([
  AuthType.LOGIN_WITH_GOOGLE,
  AuthType.USE_GEMINI,
  AuthType.USE_VERTEX_AI,
  AuthType.COMPUTE_ADC,
  AuthType.LEGACY_CLOUD_SHELL,
]);

function normalizeAuthType(value: unknown): AuthType | undefined {
  if (typeof value !== 'string') return undefined;

  // Legacy: some older settings stored this as "google"
  if (value === 'google') {
    return AuthType.LOGIN_WITH_GOOGLE;
  }

  switch (value) {
    case AuthType.LOGIN_WITH_GOOGLE:
    case AuthType.USE_GEMINI:
    case AuthType.USE_VERTEX_AI:
    case AuthType.LEGACY_CLOUD_SHELL:
    case AuthType.COMPUTE_ADC:
    case AuthType.USE_OPENAI_COMPATIBLE:
    case AuthType.USE_OPENAI_CHATGPT_OAUTH:
      return value;
    default:
      return undefined;
  }
}

export function resolveEffectiveAuthType(
  settings: Settings,
): AuthType | undefined {
  const provider = settings.llm?.provider;
  if (provider === 'openai_compatible') {
    return AuthType.USE_OPENAI_COMPATIBLE;
  }
  if (provider === 'openai_chatgpt_oauth') {
    return AuthType.USE_OPENAI_CHATGPT_OAUTH;
  }

  const selectedType = normalizeAuthType(settings.security?.auth?.selectedType);
  if (!selectedType) return undefined;
  return GEMINI_AUTH_TYPES.has(selectedType) ? selectedType : undefined;
}
