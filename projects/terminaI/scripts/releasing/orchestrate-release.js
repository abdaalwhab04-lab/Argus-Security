/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// @ts-check

import { execSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import yargs from 'yargs/yargs';
import { hideBin } from 'yargs/helpers';

/**
 * @param {Record<string, string>} outputs
 */
function writeOutputs(outputs) {
  const outputFile = process.env['GITHUB_OUTPUT'];
  if (outputFile) {
    for (const [key, value] of Object.entries(outputs)) {
      appendFileSync(outputFile, `${key}=${value}\n`);
    }
    return;
  }
  console.log(JSON.stringify(outputs, null, 2));
}

/**
 * @param {string} cwd
 */
function gitDescribeTag(cwd) {
  return execSync('git describe --tags --abbrev=0', {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
    .toString()
    .trim();
}

/**
 * @param {string} versionInput
 */
function parseVersion(versionInput) {
  if (!versionInput.startsWith('v')) {
    throw new Error(
      `Invalid version "${versionInput}". Expected a v-prefixed semver (e.g., v0.1.11).`,
    );
  }
  return {
    releaseTag: versionInput,
    releaseVersion: versionInput.slice(1),
  };
}

/**
 * @param {string} output
 */
function parseJsonOutput(output) {
  try {
    return JSON.parse(output);
  } catch (_error) {
    throw new Error(`Failed to parse JSON output: ${output}`);
  }
}

yargs(hideBin(process.argv))
  .command(
    'manual',
    'Prepare release metadata for manual releases.',
    (y) =>
      y
        .option('version', {
          type: 'string',
          demandOption: true,
          describe: 'The v-prefixed version (e.g., v0.1.11).',
        })
        .option('working-dir', {
          type: 'string',
          default: process.cwd(),
          describe: 'Repository directory used to resolve tags.',
        }),
    (argv) => {
      const { releaseTag, releaseVersion } = parseVersion(
        /** @type {string} */ (argv.version),
      );
      const previousTag = gitDescribeTag(
        /** @type {string} */ (argv['working-dir']),
      );
      writeOutputs({
        RELEASE_VERSION: releaseVersion,
        RELEASE_TAG: releaseTag,
        PREVIOUS_TAG: previousTag,
      });
    },
  )
  .command(
    'patch',
    'Prepare release metadata for patch releases.',
    (y) =>
      y
        .option('patch-from', {
          type: 'string',
          demandOption: true,
          describe: 'Channel to patch from (stable or preview).',
        })
        .option('cli-package-name', {
          type: 'string',
          demandOption: true,
          describe: 'CLI package name used to resolve versions.',
        }),
    (argv) => {
      const output = execSync(
        [
          'node',
          'scripts/get-release-version.js',
          '--type=patch',
          `--cli-package-name=${argv['cli-package-name']}`,
          `--patch-from=${argv['patch-from']}`,
        ].join(' '),
        { stdio: ['ignore', 'pipe', 'pipe'] },
      )
        .toString()
        .trim();
      const payload = parseJsonOutput(output);
      writeOutputs({
        RELEASE_VERSION: payload.releaseVersion,
        RELEASE_TAG: payload.releaseTag,
        NPM_TAG: payload.npmTag,
        PREVIOUS_TAG: payload.previousReleaseTag,
      });
    },
  )
  .demandCommand(1)
  .strict()
  .parse();
