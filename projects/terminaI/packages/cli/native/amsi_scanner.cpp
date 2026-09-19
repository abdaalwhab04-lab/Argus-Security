/**
 * @license
 * Copyright 2025 Google LLC
 * Portions Copyright 2025 TerminaI Authors
 * SPDX-License-Identifier: Apache-2.0
 *
 * Task 43: Native Module - AMSI Scanner Implementation
 *
 * This module wraps the Windows AMSI (Antimalware Scan Interface) API.
 * By calling AMSI before script execution, TerminAI proves to Defender
 * that it is a "Good Citizen" application that doesn't execute malware.
 *
 * @see docs-terminai/architecture-sovereign-runtime.md Appendix M.4
 */

#ifdef _WIN32

#include "amsi_scanner.h"
#include "appcontainer_manager.h"
#include <iostream>
#include <fstream>
#include <sstream>

namespace TerminAI {

// ============================================================================
// Global State
// ============================================================================

static HAMSICONTEXT g_amsiContext = nullptr;
static const wchar_t* const AMSI_APP_NAME = L"TerminAI";

// ============================================================================
// Lifecycle Functions
// ============================================================================

bool InitializeAmsi() {
    if (g_amsiContext != nullptr) {
        return true; // Already initialized
    }

    HRESULT hr = AmsiInitialize(AMSI_APP_NAME, &g_amsiContext);

    if (FAILED(hr)) {
        std::cerr << "[AmsiScanner] AmsiInitialize failed: 0x"
                  << std::hex << hr << std::endl;
        return false;
    }

    std::cout << "[AmsiScanner] AMSI initialized successfully" << std::endl;
    return true;
}

void UninitializeAmsi() {
    if (g_amsiContext != nullptr) {
        AmsiUninitialize(g_amsiContext);
        g_amsiContext = nullptr;
        std::cout << "[AmsiScanner] AMSI uninitialized" << std::endl;
    }
}

bool IsAmsiInitialized() {
    return g_amsiContext != nullptr;
}

// ============================================================================
// Helper Functions
// ============================================================================

std::string GetAmsiResultDescription(AMSI_RESULT result) {
    switch (result) {
        case AMSI_RESULT_CLEAN:
            return "Content is clean";
        case AMSI_RESULT_NOT_DETECTED:
            return "No threat detected";
        case AMSI_RESULT_BLOCKED_BY_ADMIN_START:
            return "Blocked by administrator policy";
        case AMSI_RESULT_DETECTED:
            return "Malware detected";
        default:
            if (result >= AMSI_RESULT_BLOCKED_BY_ADMIN_START &&
                result <= AMSI_RESULT_BLOCKED_BY_ADMIN_END) {
                return "Blocked by administrator policy";
            }
            if (result >= AMSI_RESULT_DETECTED) {
                return "Threat detected (level: " + std::to_string(result - AMSI_RESULT_DETECTED) + ")";
            }
            return "Unknown result: " + std::to_string(result);
    }
}

bool IsAmsiResultClean(AMSI_RESULT result) {
    // AMSI_RESULT_CLEAN = 0
    // AMSI_RESULT_NOT_DETECTED = 1
    // Anything >= 2 is potentially dangerous
    return result <= AMSI_RESULT_NOT_DETECTED;
}

// ============================================================================
// NAPI Export: AmsiScanBuffer
// ============================================================================

Napi::Value AmsiScanBuffer(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    // Create result object
    Napi::Object result = Napi::Object::New(env);

    // Validate arguments
    if (info.Length() < 2 || !info[0].IsString() || !info[1].IsString()) {
        result.Set("clean", Napi::Boolean::New(env, false));
        result.Set("result", Napi::Number::New(env, -1));
        result.Set("description", Napi::String::New(env, "Invalid arguments"));
        return result;
    }

    // Check AMSI initialization
    if (!IsAmsiInitialized()) {
        if (!InitializeAmsi()) {
            result.Set("clean", Napi::Boolean::New(env, false));
            result.Set("result", Napi::Number::New(env, -2));
            result.Set("description", Napi::String::New(env, "AMSI not available"));
            return result;
        }
    }

    std::string content = info[0].As<Napi::String>().Utf8Value();
    std::string filename = info[1].As<Napi::String>().Utf8Value();
    std::wstring filenameWide = Utf8ToWide(filename);

    // Perform AMSI scan
    AMSI_RESULT amsiResult = AMSI_RESULT_DETECTED; // Default to detected for safety
    HRESULT hr = ::AmsiScanBuffer(
        g_amsiContext,
        content.data(),
        static_cast<ULONG>(content.size()),
        filenameWide.c_str(),
        nullptr,  // No session
        &amsiResult
    );

    if (FAILED(hr)) {
        std::cerr << "[AmsiScanner] AmsiScanBuffer failed: 0x"
                  << std::hex << hr << std::endl;

        result.Set("clean", Napi::Boolean::New(env, false));
        result.Set("result", Napi::Number::New(env, -3));
        result.Set("description", Napi::String::New(env, "AMSI scan failed"));
        return result;
    }

    bool clean = IsAmsiResultClean(amsiResult);
    std::string description = GetAmsiResultDescription(amsiResult);

    result.Set("clean", Napi::Boolean::New(env, clean));
    result.Set("result", Napi::Number::New(env, static_cast<int32_t>(amsiResult)));
    result.Set("description", Napi::String::New(env, description));

    if (!clean) {
        std::cout << "[AmsiScanner] THREAT DETECTED in " << filename
                  << ": " << description << std::endl;
    }

    return result;
}

// ============================================================================
// NAPI Export: AmsiScanFile
// ============================================================================

Napi::Value AmsiScanFile(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    // Validate arguments
    if (info.Length() < 1 || !info[0].IsString()) {
        Napi::Object result = Napi::Object::New(env);
        result.Set("clean", Napi::Boolean::New(env, false));
        result.Set("result", Napi::Number::New(env, -1));
        result.Set("description", Napi::String::New(env, "Invalid arguments"));
        return result;
    }

    std::string filepath = info[0].As<Napi::String>().Utf8Value();

    // Read file contents
    std::ifstream file(filepath, std::ios::binary);
    if (!file.is_open()) {
        Napi::Object result = Napi::Object::New(env);
        result.Set("clean", Napi::Boolean::New(env, false));
        result.Set("result", Napi::Number::New(env, -4));
        result.Set("description", Napi::String::New(env, "Failed to open file"));
        return result;
    }

    std::stringstream buffer;
    buffer << file.rdbuf();
    std::string content = buffer.str();
    file.close();

    // Extract filename for AMSI context
    std::string filename = filepath;
    size_t lastSlash = filepath.find_last_of("/\\");
    if (lastSlash != std::string::npos) {
        filename = filepath.substr(lastSlash + 1);
    }

    // Call AmsiScanBuffer with the file contents
    Napi::Array args = Napi::Array::New(env, 2);
    args.Set((uint32_t)0, Napi::String::New(env, content));
    args.Set((uint32_t)1, Napi::String::New(env, filename));

    // Reconstruct CallbackInfo is not possible, so we duplicate the logic
    // Check AMSI initialization
    if (!IsAmsiInitialized()) {
        if (!InitializeAmsi()) {
            Napi::Object result = Napi::Object::New(env);
            result.Set("clean", Napi::Boolean::New(env, false));
            result.Set("result", Napi::Number::New(env, -2));
            result.Set("description", Napi::String::New(env, "AMSI not available"));
            return result;
        }
    }

    std::wstring filenameWide = Utf8ToWide(filename);

    AMSI_RESULT amsiResult = AMSI_RESULT_DETECTED;
    HRESULT hr = ::AmsiScanBuffer(
        g_amsiContext,
        content.data(),
        static_cast<ULONG>(content.size()),
        filenameWide.c_str(),
        nullptr,
        &amsiResult
    );

    Napi::Object result = Napi::Object::New(env);

    if (FAILED(hr)) {
        result.Set("clean", Napi::Boolean::New(env, false));
        result.Set("result", Napi::Number::New(env, -3));
        result.Set("description", Napi::String::New(env, "AMSI scan failed"));
        return result;
    }

    bool clean = IsAmsiResultClean(amsiResult);
    std::string description = GetAmsiResultDescription(amsiResult);

    result.Set("clean", Napi::Boolean::New(env, clean));
    result.Set("result", Napi::Number::New(env, static_cast<int32_t>(amsiResult)));
    result.Set("description", Napi::String::New(env, description));

    return result;
}

} // namespace TerminAI

#endif // _WIN32
