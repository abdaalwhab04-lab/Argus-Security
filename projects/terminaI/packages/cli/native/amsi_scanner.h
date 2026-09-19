/**
 * @license
 * Copyright 2025 Google LLC
 * Portions Copyright 2025 TerminaI Authors
 * SPDX-License-Identifier: Apache-2.0
 *
 * Task 43: Native Module - AMSI Scanner Header
 *
 * This header defines the API for scanning content using Windows AMSI
 * (Antimalware Scan Interface). By calling AMSI before executing scripts,
 * TerminAI proves to Windows Defender that it is a "Good Citizen" application.
 *
 * AMSI Integration Flow:
 * 1. Brain generates/downloads script
 * 2. Brain sends script to Hands via Named Pipe
 * 3. Hands scans script with AMSI
 * 4. If CLEAN, Hands executes script
 * 5. If MALWARE, Hands rejects with error
 *
 * @see docs-terminai/architecture-sovereign-runtime.md Appendix M.4
 */

#pragma once

#ifdef _WIN32

#include <napi.h>
#include <windows.h>
#include <amsi.h>
#include <string>

// Linker pragma (safety net)
#pragma comment(lib, "Amsi.lib")

namespace TerminAI {

// ============================================================================
// AMSI Result Codes
// ============================================================================

/**
 * AMSI scan result codes (mirrors AMSI_RESULT enum).
 * Values 0-1 are safe, 2+ are increasing threat levels.
 */
enum class AmsiResult : int32_t {
    /** Content is clean */
    Clean = 0,

    /** Content not detected as malware (still safe) */
    NotDetected = 1,

    /** Content blocked by administrator policy */
    BlockedByAdminStart = 16384,  // 0x4000
    BlockedByAdminEnd = 20479,    // 0x4FFF

    /** Content detected as malware */
    Detected = 32768,             // 0x8000
};

// ============================================================================
// Lifecycle Functions
// ============================================================================

/**
 * Initialize AMSI context.
 * Call once at module load.
 *
 * @return true if initialization succeeded
 */
bool InitializeAmsi();

/**
 * Cleanup AMSI context.
 * Call at module unload or application exit.
 */
void UninitializeAmsi();

/**
 * Check if AMSI is initialized.
 *
 * @return true if ready to scan
 */
bool IsAmsiInitialized();

// ============================================================================
// NAPI Exports
// ============================================================================

/**
 * Scan content for malware using Windows AMSI.
 *
 * Arguments:
 *   0: String - Content to scan (script body)
 *   1: String - Filename/context for the scan
 *
 * Returns: Object
 *   - clean: Boolean - true if content is safe
 *   - result: Number - AMSI result code
 *   - description: String - Human-readable description
 *
 * Example:
 *   const result = amsiScanBuffer("rm -rf /", "script.ps1");
 *   // result = { clean: false, result: 32768, description: "Malware detected" }
 */
Napi::Value AmsiScanBuffer(const Napi::CallbackInfo& info);

/**
 * Scan a file for malware by reading its contents.
 *
 * Arguments:
 *   0: String - Absolute path to file
 *
 * Returns: Same as AmsiScanBuffer
 */
Napi::Value AmsiScanFile(const Napi::CallbackInfo& info);

// ============================================================================
// Internal Helpers
// ============================================================================

/**
 * Get human-readable description for AMSI result code.
 *
 * @param result AMSI result code
 * @return Description string
 */
std::string GetAmsiResultDescription(AMSI_RESULT result);

/**
 * Check if AMSI result indicates the content is safe.
 *
 * @param result AMSI result code
 * @return true if safe (CLEAN or NOT_DETECTED)
 */
bool IsAmsiResultClean(AMSI_RESULT result);

} // namespace TerminAI

#else // Non-Windows platforms

#include <napi.h>

namespace TerminAI {

// Stub implementations for non-Windows platforms
bool InitializeAmsi();
void UninitializeAmsi();
bool IsAmsiInitialized();
Napi::Value AmsiScanBuffer(const Napi::CallbackInfo& info);
Napi::Value AmsiScanFile(const Napi::CallbackInfo& info);

} // namespace TerminAI

#endif // _WIN32
