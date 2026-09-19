/**
 * @license
 * Copyright 2025 Google LLC
 * Portions Copyright 2025 TerminaI Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import os from 'node:os';
import { vi } from 'vitest';

export type TestContextOptions = {
  platform?: NodeJS.Platform;
  homedir?: string;
  tmpdir?: string;
  cwd?: string;
  env?: Record<string, string | undefined>;
};

export type TestContext = {
  restore: () => void;
};

function setProcessPlatform(
  platform: NodeJS.Platform | undefined,
): PropertyDescriptor | undefined {
  if (!platform) {
    return undefined;
  }
  const original = Object.getOwnPropertyDescriptor(process, 'platform');
  Object.defineProperty(process, 'platform', {
    value: platform,
    configurable: true,
  });
  return original;
}

export function createTestContext(
  options: TestContextOptions = {},
): TestContext {
  const platformDescriptor = setProcessPlatform(options.platform);
  const restoreFns: Array<() => void> = [];
  const envSnapshot = new Map<string, string | undefined>();

  if (options.platform) {
    const platformSpy = vi
      .spyOn(os, 'platform')
      .mockReturnValue(options.platform);
    restoreFns.push(() => platformSpy.mockRestore());
  }

  if (options.homedir) {
    const homedirSpy = vi.spyOn(os, 'homedir').mockReturnValue(options.homedir);
    restoreFns.push(() => homedirSpy.mockRestore());
  }

  if (options.tmpdir) {
    const tmpdirSpy = vi.spyOn(os, 'tmpdir').mockReturnValue(options.tmpdir);
    restoreFns.push(() => tmpdirSpy.mockRestore());
  }

  if (options.cwd) {
    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(options.cwd);
    restoreFns.push(() => cwdSpy.mockRestore());
  }

  if (options.env) {
    for (const [key, value] of Object.entries(options.env)) {
      envSnapshot.set(key, process.env[key]);
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }

  return {
    restore: () => {
      for (const restore of restoreFns.reverse()) {
        restore();
      }
      if (platformDescriptor) {
        Object.defineProperty(process, 'platform', platformDescriptor);
      }
      for (const [key, value] of envSnapshot.entries()) {
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
    },
  };
}

export async function withTestContext<T>(
  options: TestContextOptions,
  fn: () => Promise<T> | T,
): Promise<T> {
  const context = createTestContext(options);
  try {
    return await fn();
  } finally {
    context.restore();
  }
}
