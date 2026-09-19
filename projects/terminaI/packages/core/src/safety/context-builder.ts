/**
 * @license
 * Copyright 2025 Google LLC
 * Portions Copyright 2025 TerminaI Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { SafetyCheckInput, ConversationTurn } from './protocol.js';
import type { Config } from '../config/config.js';
import type { RuntimeContext } from '../computer/RuntimeContext.js';

/**
 * Builds context objects for safety checkers, ensuring sensitive data is filtered.
 */
export class ContextBuilder {
  constructor(
    private readonly config: Config,
    private readonly conversationHistory: ConversationTurn[] = [],
    private runtimeContext?: RuntimeContext,
  ) {}

  setRuntimeContext(context: RuntimeContext): void {
    this.runtimeContext = context;
  }

  /**
   * Builds the full context object with all available data.
   */
  buildFullContext(): SafetyCheckInput['context'] {
    return {
      environment: {
        cwd: process.cwd(),
        workspaces: this.config
          .getWorkspaceContext()
          .getDirectories() as string[],
      },
      history: {
        turns: this.conversationHistory,
      },
      runtime: this.runtimeContext
        ? {
            isIsolated: this.runtimeContext.isIsolated,
          }
        : undefined,
    };
  }

  /**
   * Builds a minimal context with only the specified keys.
   */
  buildMinimalContext(
    requiredKeys: Array<keyof SafetyCheckInput['context']>,
  ): SafetyCheckInput['context'] {
    const fullContext = this.buildFullContext();
    const minimalContext: SafetyCheckInput['context'] = {
      environment: fullContext.environment,
    };

    if (requiredKeys.includes('history')) {
      minimalContext.history = fullContext.history;
    }

    if (requiredKeys.includes('runtime')) {
      minimalContext.runtime = fullContext.runtime;
    }

    return minimalContext;
  }
}
