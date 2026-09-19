/**
 * @license
 * Copyright 2025 Google LLC
 * Portions Copyright 2025 TerminaI Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { z } from 'zod';

export const ConfigSchema = z
  .object({
    sessionId: z.string(),
    targetDir: z.string(),
    cwd: z.string(),
    debugMode: z.boolean(),
    model: z.string(),
  })
  .passthrough();
