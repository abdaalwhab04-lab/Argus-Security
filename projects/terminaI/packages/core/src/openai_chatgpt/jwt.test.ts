/**
 * @license
 * Copyright 2025 Google LLC
 * Portions Copyright 2025 TerminaI Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { decodeJwtPayload } from './jwt.js';

function jwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'none' })).toString(
    'base64url',
  );
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${header}.${body}.`;
}

describe('decodeJwtPayload', () => {
  it('decodes base64url JSON payload', () => {
    const token = jwt({ sub: 'user', foo: 'bar' });
    expect(decodeJwtPayload(token)).toEqual({ sub: 'user', foo: 'bar' });
  });

  it('throws for invalid token', () => {
    expect(() => decodeJwtPayload('not-a-jwt')).toThrow('Invalid JWT');
  });
});
