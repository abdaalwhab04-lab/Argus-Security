/**
 * @license
 * Copyright 2025 Google LLC
 * Portions Copyright 2025 TerminaI Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ConfigParameters } from '../config/config.js';
import { Config } from '../config/config.js';
import { ConfigSchema } from '../config/configSchema.js';

/**
 * Default parameters used for {@link FAKE_CONFIG}
 */
export const DEFAULT_CONFIG_PARAMETERS: ConfigParameters = {
  usageStatisticsEnabled: true,
  debugMode: false,
  sessionId: 'test-session-id',
  proxy: undefined,
  model: 'gemini-9001-super-duper',
  targetDir: '/',
  cwd: '/',
};

/**
 * Produces a config.  Default parameters are set to
 * {@link DEFAULT_CONFIG_PARAMETERS}, optionally, fields can be specified to
 * override those defaults.
 */
export function makeFakeConfig(
  config: Partial<ConfigParameters> = {
    ...DEFAULT_CONFIG_PARAMETERS,
  },
): Config {
  const params = ConfigSchema.parse({
    ...DEFAULT_CONFIG_PARAMETERS,
    ...config,
  });
  return new Config(params);
}
