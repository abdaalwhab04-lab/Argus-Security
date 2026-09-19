/**
 * @license
 * Copyright 2025 Google LLC
 * Portions Copyright 2025 TerminaI Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Windows Runtime Module Exports
 *
 * This module provides Windows-specific runtime functionality for the
 * "Brain & Hands" AppContainer architecture.
 *
 * Components:
 * - BrokerServer: Named Pipe IPC server for privileged "Hands" process
 * - BrokerClient: IPC client for sandboxed "Brain" process
 * - BrokerSchema: Zod schemas for IPC message validation
 * - WindowsBrokerContext: RuntimeContext implementation
 * - native: TypeScript bindings for C++ native module
 */

export * from './BrokerServer.js';
export * from './BrokerClient.js';
export * from './BrokerSchema.js';
export * from './WindowsBrokerContext.js';
export * as native from './native.js';
