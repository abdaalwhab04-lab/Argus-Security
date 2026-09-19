/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const allowlist = new Map([
  [
    path.normalize('packages/core/src/code_assist/oauth2.ts'),
    new Set(['google-oauth-client-id']),
  ],
]);

const patterns = [
  {
    id: 'google-oauth-client-id',
    label: 'Google OAuth Client ID',
    regex: /\b\d{5,}-[a-z0-9_-]+\.apps\.googleusercontent\.com\b/gi,
  },
  {
    id: 'github-token',
    label: 'GitHub token',
    regex: /\bgh[oprsu]_[A-Za-z0-9]{20,}\b/g,
  },
];

function isAllowed(filePath, patternId) {
  const normalized = path.normalize(filePath);
  const allowed = allowlist.get(normalized);
  return allowed ? allowed.has(patternId) : false;
}

function getTrackedFiles() {
  const output = execSync('git ls-files -z', { encoding: 'utf8' });
  return output
    .split('\0')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function scanFile(filePath) {
  const content = readFileSync(filePath, 'utf8');
  const violations = [];
  for (const pattern of patterns) {
    if (pattern.regex.test(content) && !isAllowed(filePath, pattern.id)) {
      violations.push(pattern.label);
    }
    pattern.regex.lastIndex = 0;
  }
  return violations;
}

const files = getTrackedFiles();
const results = [];

for (const file of files) {
  try {
    const violations = scanFile(file);
    if (violations.length > 0) {
      results.push({ file, violations });
    }
  } catch {
    // Skip binary/unreadable files.
  }
}

if (results.length > 0) {
  console.error('Secret scan failed: potential secrets detected.');
  for (const result of results) {
    console.error(`- ${result.file}: ${result.violations.join(', ')}`);
  }
  process.exit(1);
}

console.log('Secret scan passed.');
