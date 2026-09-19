/**
 * @license
 * Copyright 2025 Google LLC
 * Portions Copyright 2025 TerminaI Authors
 * SPDX-License-Identifier: Apache-2.0
 */

export * from './RuntimeManager.js';
export * from './ContainerRuntimeContext.js';
export * from './LocalRuntimeContext.js';

// Windows-specific exports (conditionally available)
export * as windows from './windows/index.js';
