/**
 * @license
 * Copyright 2025 Google LLC
 * Portions Copyright 2025 TerminaI Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { redactEvent } from './redaction.js';
import type { AuditEvent } from './schema.js';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

describe('redactEvent', () => {
  it('redacts secret-looking keys even if values do not match token patterns', () => {
    const event: AuditEvent = {
      version: 1,
      eventType: 'tool.requested',
      timestamp: new Date().toISOString(),
      sessionId: 's1',
      provenance: ['local_user'],
      tool: {
        callId: 'c1',
        toolName: 'run_terminal_command',
        args: {
          headers: {
            Authorization: 'Bearer access-token-value',
            'ChatGPT-Account-ID': 'acct_123',
          },
        },
      },
    };

    const redacted = redactEvent(event, { redactUiTypedText: false });

    const args = redacted.tool?.args;
    expect(isPlainObject(args)).toBe(true);
    if (!isPlainObject(args)) return;

    const headers = args['headers'];
    expect(isPlainObject(headers)).toBe(true);
    if (!isPlainObject(headers)) return;

    expect(headers['Authorization']).not.toContain('access-token-value');
    expect(headers['ChatGPT-Account-ID']).toBe('***');
    expect(redacted.redactions?.length).toBeGreaterThan(0);
  });
});
