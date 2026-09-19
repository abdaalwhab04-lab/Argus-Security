/**
 * @license
 * Copyright 2025 Google LLC
 * Portions Copyright 2025 TerminaI Authors
 * SPDX-License-Identifier: Apache-2.0
 */

export function decodeJwtPayload(token: string): Record<string, unknown> {
  const parts = token.split('.');
  if (parts.length < 2) {
    throw new Error('Invalid JWT: missing payload');
  }

  const payloadB64Url = parts[1];
  const json = Buffer.from(base64UrlToBase64(payloadB64Url), 'base64').toString(
    'utf8',
  );
  const parsed = JSON.parse(json) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Invalid JWT: payload is not an object');
  }
  return parsed as Record<string, unknown>;
}

function base64UrlToBase64(value: string): string {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padding = normalized.length % 4;
  if (padding === 0) return normalized;
  if (padding === 2) return normalized + '==';
  if (padding === 3) return normalized + '=';
  throw new Error('Invalid base64url string');
}
