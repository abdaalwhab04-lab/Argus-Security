/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { execSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

const argv = yargs(hideBin(process.argv))
  .option('skip-tapts', {
    type: 'boolean',
    default: false,
    description: 'Skip building the T-APTS wheel',
  })
  .option('require-tapts', {
    type: 'boolean',
    default: false,
    description: 'Fail if the T-APTS wheel cannot be built',
  })
  .parse();

const skipTapts =
  argv['skip-tapts'] ||
  process.env.TERMINAI_SKIP_TAPTS === '1' ||
  process.env.TERMINAI_SKIP_TAPTS === 'true';
const requireTapts =
  argv['require-tapts'] ||
  process.env.TERMINAI_REQUIRE_TAPTS === '1' ||
  process.env.TERMINAI_REQUIRE_TAPTS === 'true';

if (skipTapts) {
  console.log('Skipping T-APTS wheel build (skip-tapts enabled).');
  process.exit(0);
}

const repoRoot = join(process.cwd(), '..', '..');
const taptsDir = join(repoRoot, 'packages', 'sandbox-image', 'python');
const outDir = join(repoRoot, 'packages', 'cli', 'dist');

if (!existsSync(taptsDir)) {
  const message = `T-APTS source directory not found at ${taptsDir}`;
  if (requireTapts) {
    console.error(message);
    process.exit(1);
  }
  console.warn(`Skipping T-APTS wheel build: ${message}`);
  process.exit(0);
}

if (!existsSync(outDir)) {
  mkdirSync(outDir, { recursive: true });
}

try {
  execSync('python3 -c "import build"', {
    stdio: 'ignore',
    cwd: taptsDir,
  });
} catch (error) {
  const message =
    'python3 build module is missing. Install with `python3 -m pip install build`.';
  if (requireTapts) {
    console.error(message);
    console.error(error);
    process.exit(1);
  }
  console.warn(`Skipping T-APTS wheel build: ${message}`);
  process.exit(0);
}

try {
  execSync('python3 -m build --wheel --outdir ../../../packages/cli/dist/', {
    stdio: 'inherit',
    cwd: taptsDir,
  });
} catch (error) {
  const message =
    'Failed to build T-APTS wheel. Ensure python3 -m build is available.';
  if (requireTapts) {
    console.error(message);
    console.error(error);
    process.exit(1);
  }
  console.warn(`Skipping T-APTS wheel build: ${message}`);
  process.exit(0);
}
