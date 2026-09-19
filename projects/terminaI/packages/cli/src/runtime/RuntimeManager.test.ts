/**
 * @license
 * Copyright 2025 Google LLC
 * Portions Copyright 2025 TerminaI Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RuntimeManager } from './RuntimeManager.js';
import { LocalRuntimeContext } from './LocalRuntimeContext.js';
import * as child_process from 'node:child_process';
import * as readline from 'node:readline';

vi.mock('node:child_process');
vi.mock('node:readline');

describe('RuntimeManager', () => {
  const cliVersion = '1.0.0';
  let runtimeManager: RuntimeManager;

  beforeEach(() => {
    vi.clearAllMocks();
    runtimeManager = new RuntimeManager(cliVersion);
    process.stdin.isTTY = true; // Default to TTY for interactive tests
    delete process.env['TERMINAI_ALLOW_DIRECT_HOST'];
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should fall through when docker is available but containers are deferred', async () => {
    // Mock docker check success
    vi.mocked(child_process.execSync).mockImplementation((command) => {
      if (command.includes('docker info')) return '';
      throw new Error('Command failed');
    });

    await expect(runtimeManager.getContext()).rejects.toThrow(
      'No suitable runtime found',
    );
  });

  it('should fallback to LocalRuntimeContext if system python is available and user approves', async () => {
    // Mock docker check fail
    vi.mocked(child_process.execSync).mockImplementation((command) => {
      if (command.includes('docker')) throw new Error('No docker');
      if (command.includes('podman')) throw new Error('No podman');
      if (command.includes('python3 --version')) return 'Python 3.10.0';
      if (command.includes('which python3')) return '/usr/bin/python3';
      if (command.includes('-m venv')) return ''; // Mock successfully venv creation
      if (command.includes('pip install')) return ''; // Mock pip install
      if (command.includes('python')) return ''; // Catch-all for other python commands checking
      throw new Error(`Unknown command: ${command}`);
    });

    // Mock readline user approval
    const mockInterface = {
      question: (_q: string, cb: (ans: string) => void) => cb('yes'),
      close: vi.fn(),
    } as unknown as readline.Interface;
    vi.mocked(readline.createInterface).mockReturnValue(mockInterface);

    const context = await runtimeManager.getContext();
    expect(context).toBeInstanceOf(LocalRuntimeContext);
    expect(context.type).toBe('local');
    expect(context).toBeInstanceOf(LocalRuntimeContext);
    expect(context.type).toBe('local');
    // pythonPath should be updated to venv
    expect(context.pythonPath).toContain('.terminai/envs/default');
  });

  it('should respect TERMINAI_ALLOW_DIRECT_HOST env var', async () => {
    process.env['TERMINAI_ALLOW_DIRECT_HOST'] = 'true';

    // Mock docker fail, python success
    vi.mocked(child_process.execSync).mockImplementation((command) => {
      if (command.includes('docker')) throw new Error('No docker');
      if (command.includes('podman')) throw new Error('No podman');
      if (command.includes('python3 --version')) return 'Python 3.10.0';
      if (command.includes('which python3')) return '/usr/bin/python3';
      return '';
    });

    const context = await runtimeManager.getContext();
    expect(context).toBeInstanceOf(LocalRuntimeContext);
    // Should NOT have called readline
    expect(readline.createInterface).not.toHaveBeenCalled();
  });

  it('should deny access if user rejects prompt', async () => {
    // Mock docker fail, python success
    vi.mocked(child_process.execSync).mockImplementation((command) => {
      if (command.includes('docker')) throw new Error('No docker');
      if (command.includes('podman')) throw new Error('No podman');
      if (command.includes('python3 --version')) return 'Python 3.10.0';
      if (command.includes('which python3')) return '/usr/bin/python3';
      return '';
    });

    // Mock readline user rejection
    const mockInterface = {
      question: (_q: string, cb: (ans: string) => void) => cb('no'),
      close: vi.fn(),
    } as unknown as readline.Interface;
    vi.mocked(readline.createInterface).mockReturnValue(mockInterface);

    await expect(runtimeManager.getContext()).rejects.toThrow(
      'Direct host access denied',
    );
  });

  it('should fail if no runtime is available', async () => {
    vi.mocked(child_process.execSync).mockImplementation(() => {
      throw new Error('Command failed');
    });

    await expect(runtimeManager.getContext()).rejects.toThrow(
      'No suitable runtime found',
    );
  });
});
