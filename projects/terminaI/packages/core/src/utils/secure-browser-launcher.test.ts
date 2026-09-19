/**
 * @license
 * Copyright 2025 Google LLC
 * Portions Copyright 2025 TerminaI Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { withTestContext } from '@terminai/test-utils';
import { openBrowserSecurely } from './secure-browser-launcher.js';
import { EventEmitter } from 'node:events';

// Create mock spawn function
const mockSpawn = vi.hoisted(() => vi.fn());

// Mock child_process module
vi.mock('node:child_process', () => ({
  spawn: mockSpawn,
}));

describe('secure-browser-launcher', () => {
  function createMockChildProcess() {
    const child = new EventEmitter() as EventEmitter & {
      unref: ReturnType<typeof vi.fn>;
    };
    child.unref = vi.fn();
    return child;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    const mockChild = createMockChildProcess();
    mockSpawn.mockReturnValue(mockChild);
  });

  describe('URL validation', () => {
    it('should allow valid HTTP URLs', async () => {
      await withTestContext({ platform: 'darwin' }, async () => {
        await openBrowserSecurely('http://example.com');
        expect(mockSpawn).toHaveBeenCalledWith(
          'open',
          ['http://example.com'],
          expect.any(Object),
        );
      });
    });

    it('should allow valid HTTPS URLs', async () => {
      await withTestContext({ platform: 'darwin' }, async () => {
        await openBrowserSecurely('https://example.com');
        expect(mockSpawn).toHaveBeenCalledWith(
          'open',
          ['https://example.com'],
          expect.any(Object),
        );
      });
    });

    it('should reject non-HTTP(S) protocols', async () => {
      await expect(openBrowserSecurely('file:///etc/passwd')).rejects.toThrow(
        'Unsafe protocol',
      );
      await expect(openBrowserSecurely('javascript:alert(1)')).rejects.toThrow(
        'Unsafe protocol',
      );
      await expect(openBrowserSecurely('ftp://example.com')).rejects.toThrow(
        'Unsafe protocol',
      );
    });

    it('should reject invalid URLs', async () => {
      await expect(openBrowserSecurely('not-a-url')).rejects.toThrow(
        'Invalid URL',
      );
      await expect(openBrowserSecurely('')).rejects.toThrow('Invalid URL');
    });

    it('should reject URLs with control characters', async () => {
      await expect(
        openBrowserSecurely('http://example.com\nmalicious-command'),
      ).rejects.toThrow('invalid characters');
      await expect(
        openBrowserSecurely('http://example.com\rmalicious-command'),
      ).rejects.toThrow('invalid characters');
      await expect(
        openBrowserSecurely('http://example.com\x00'),
      ).rejects.toThrow('invalid characters');
    });
  });

  describe('Command injection prevention', () => {
    it('should prevent PowerShell command injection on Windows', async () => {
      await withTestContext({ platform: 'win32' }, async () => {
        // The POC from the vulnerability report
        const maliciousUrl =
          "http://127.0.0.1:8080/?param=example#$(Invoke-Expression([System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('Y2FsYy5leGU='))))";

        await openBrowserSecurely(maliciousUrl);

        // Verify that spawn was called with PowerShell and the URL is passed safely
        expect(mockSpawn).toHaveBeenCalledWith(
          'powershell.exe',
          [
            '-NoProfile',
            '-NonInteractive',
            '-WindowStyle',
            'Hidden',
            '-Command',
            `Start-Process '${maliciousUrl.replace(/'/g, "''")}'`,
          ],
          expect.any(Object),
        );
      });
    });

    it('should handle URLs with special shell characters safely', async () => {
      await withTestContext({ platform: 'darwin' }, async () => {
        const urlsWithSpecialChars = [
          'http://example.com/path?param=value&other=$value',
          'http://example.com/path#fragment;command',
          'http://example.com/$(whoami)',
          'http://example.com/`command`',
          'http://example.com/|pipe',
          'http://example.com/>redirect',
        ];

        for (const url of urlsWithSpecialChars) {
          mockSpawn.mockClear();
          const mockChild = createMockChildProcess();
          mockSpawn.mockReturnValue(mockChild);

          await openBrowserSecurely(url);
          // Verify the URL is passed as an argument, not interpreted by shell
          expect(mockSpawn).toHaveBeenCalledWith(
            'open',
            [url],
            expect.any(Object),
          );
        }
      });
    });

    it('should properly escape single quotes in URLs on Windows', async () => {
      await withTestContext({ platform: 'win32' }, async () => {
        const urlWithSingleQuotes =
          "http://example.com/path?name=O'Brien&test='value'";
        await openBrowserSecurely(urlWithSingleQuotes);

        // Verify that single quotes are escaped by doubling them
        expect(mockSpawn).toHaveBeenCalledWith(
          'powershell.exe',
          [
            '-NoProfile',
            '-NonInteractive',
            '-WindowStyle',
            'Hidden',
            '-Command',
            `Start-Process 'http://example.com/path?name=O''Brien&test=''value'''`,
          ],
          expect.any(Object),
        );
      });
    });
  });

  describe('Platform-specific behavior', () => {
    it('should use correct command on macOS', async () => {
      await withTestContext({ platform: 'darwin' }, async () => {
        await openBrowserSecurely('https://example.com');
        expect(mockSpawn).toHaveBeenCalledWith(
          'open',
          ['https://example.com'],
          expect.any(Object),
        );
      });
    });

    it('should use PowerShell on Windows', async () => {
      await withTestContext({ platform: 'win32' }, async () => {
        await openBrowserSecurely('https://example.com');
        expect(mockSpawn).toHaveBeenCalledWith(
          'powershell.exe',
          expect.arrayContaining([
            '-Command',
            `Start-Process 'https://example.com'`,
          ]),
          expect.any(Object),
        );
      });
    });

    it('should use xdg-open on Linux', async () => {
      await withTestContext({ platform: 'linux' }, async () => {
        await openBrowserSecurely('https://example.com');
        expect(mockSpawn).toHaveBeenCalledWith(
          'xdg-open',
          ['https://example.com'],
          expect.any(Object),
        );
      });
    });

    it('should throw on unsupported platforms', async () => {
      await withTestContext({ platform: 'aix' }, async () => {
        await expect(
          openBrowserSecurely('https://example.com'),
        ).rejects.toThrow('Unsupported platform');
      });
    });
  });

  describe('Error handling', () => {
    it('should handle browser launch failures gracefully', async () => {
      await withTestContext({ platform: 'darwin' }, async () => {
        // Create child that emits error immediately
        const mockChild = createMockChildProcess();
        mockSpawn.mockReturnValue(mockChild);

        // Emit error after spawn
        setTimeout(() => {
          mockChild.emit('error', new Error('Command not found'));
        }, 10);

        await expect(
          openBrowserSecurely('https://example.com'),
        ).rejects.toThrow('Failed to open browser');
      });
    });

    it('should call unref on the child process', async () => {
      await withTestContext({ platform: 'darwin' }, async () => {
        const mockChild = createMockChildProcess();
        mockSpawn.mockReturnValue(mockChild);

        await openBrowserSecurely('https://example.com');

        expect(mockChild.unref).toHaveBeenCalled();
      });
    });
  });
});
