/**
 * @license
 * Copyright 2025 Google LLC
 * Portions Copyright 2025 TerminaI Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { platform, homedir } from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as dotenv from 'dotenv';
import {
  SettingsLoader,
  type SettingsLoaderOptions,
} from './settings/loader.js';
import {
  Config,
  type ConfigParameters,
  ApprovalMode,
  LlmProviderId,
  type ProviderConfig,
  FatalConfigError,
  PREVIEW_GEMINI_MODEL_AUTO,
  DEFAULT_GEMINI_MODEL_AUTO,
} from '../index.js';
import {
  createPolicyEngineConfig,
  resolvePolicyBrainAuthority,
} from '../policy/config.js';
import { GEMINI_DIR } from '../index.js';
import { DEFAULT_CHATGPT_CODEX_BASE_URL } from '../openai_chatgpt/constants.js';
import { ConfigSchema } from './configSchema.js';
import { isBrainAuthority } from './brainAuthority.js';
import { OutputFormat } from '../output/types.js';
import type {
  AuditExportFormat,
  AuditExportRedaction,
} from '../audit/export.js';

function normalizeOpenAIBaseUrl(raw: string | undefined): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return undefined;

  const withScheme = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  return withScheme.replace(/\/+$/, '');
}

function normalizeChatGptCodexBaseUrl(raw: string | undefined): string {
  return normalizeOpenAIBaseUrl(raw) ?? DEFAULT_CHATGPT_CODEX_BASE_URL;
}

function normalizeEnvVarName(raw: string | undefined): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim().replace(/\s+/g, '');
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeHeaders(raw: unknown): Record<string, string> | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === 'string') {
      headers[key] = value;
    }
  }
  return Object.keys(headers).length > 0 ? headers : undefined;
}

function normalizeAuditExportFormat(
  raw: unknown,
): AuditExportFormat | undefined {
  return raw === 'json' || raw === 'jsonl' ? raw : undefined;
}

function normalizeAuditExportRedaction(
  raw: unknown,
): AuditExportRedaction | undefined {
  return raw === 'enterprise' || raw === 'debug' ? raw : undefined;
}

function normalizeOutputFormat(raw: unknown): OutputFormat | undefined {
  if (
    raw === OutputFormat.TEXT ||
    raw === OutputFormat.JSON ||
    raw === OutputFormat.STREAM_JSON
  ) {
    return raw;
  }
  return undefined;
}

function normalizeReplSandboxTier(raw: unknown): 'tier1' | 'tier2' | undefined {
  return raw === 'tier1' || raw === 'tier2' ? raw : undefined;
}

function normalizeStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const filtered = value.filter(
    (item): item is string => typeof item === 'string',
  );
  return filtered.length > 0 ? filtered : [];
}

function getLegacyStringArraySetting(
  settings: unknown,
  key: 'allowedMcpServers' | 'blockedMcpServers',
): string[] | undefined {
  if (!settings || typeof settings !== 'object') return undefined;
  const record = settings as Record<string, unknown>;
  if (!(key in record)) return undefined;
  return normalizeStringArray(record[key]);
}

/**
 * Builds a Config object from settings and environment.
 */
export class ConfigBuilder {
  constructor(private readonly sessionId: string) {}

  async build(
    options: SettingsLoaderOptions & {
      question?: string;
      approvalMode?: ApprovalMode;
      overrides?: Partial<ConfigParameters>;
    } = {},
  ): Promise<Config> {
    const loader = new SettingsLoader(options);
    const loadedSettings = loader.load();
    const settings = loadedSettings.merged;

    const approvalMode =
      options.approvalMode ??
      (settings.security?.disableYoloMode
        ? ApprovalMode.DEFAULT
        : ApprovalMode.YOLO);

    const policyEngineConfig = await createPolicyEngineConfig(
      settings,
      approvalMode,
    );
    const policyBrainAuthority = await resolvePolicyBrainAuthority();

    const defaultModel = settings.general?.previewFeatures
      ? PREVIEW_GEMINI_MODEL_AUTO
      : DEFAULT_GEMINI_MODEL_AUTO;
    const resolvedModel =
      process.env['GEMINI_MODEL'] || settings.model?.name || defaultModel;

    const provider =
      (settings.llm?.provider as LlmProviderId) ?? LlmProviderId.GEMINI;

    let providerConfig: ProviderConfig;
    if (provider === LlmProviderId.OPENAI_COMPATIBLE) {
      const baseUrl = normalizeOpenAIBaseUrl(
        settings.llm?.openaiCompatible?.baseUrl,
      );
      const model = (settings.llm?.openaiCompatible?.model ?? '').trim();
      if (!baseUrl || model.length === 0) {
        throw new FatalConfigError(
          'llm.provider is set to openai_compatible, but llm.openaiCompatible.baseUrl and llm.openaiCompatible.model are required.',
        );
      }

      const authSettings = settings.llm?.openaiCompatible?.auth as
        | { type?: 'none' | 'api-key' | 'bearer'; envVarName?: string }
        | undefined;

      const authType: 'none' | 'api-key' | 'bearer' =
        authSettings?.type === 'none' ||
        authSettings?.type === 'api-key' ||
        authSettings?.type === 'bearer'
          ? authSettings.type
          : 'bearer';

      const envVarName =
        authType === 'none'
          ? undefined
          : (normalizeEnvVarName(authSettings?.envVarName) ?? 'OPENAI_API_KEY');
      const apiKey =
        envVarName && process.env[envVarName]
          ? process.env[envVarName]
          : undefined;

      const headers = normalizeHeaders(settings.llm?.headers);

      // Optional: cheaper model for internal services (summaries, compression)
      const internalModel = (
        settings.llm?.openaiCompatible?.internalModel ?? ''
      ).trim();

      providerConfig = {
        provider: LlmProviderId.OPENAI_COMPATIBLE,
        baseUrl,
        model,
        internalModel: internalModel.length > 0 ? internalModel : undefined,
        auth: {
          type: authType,
          envVarName,
          apiKey,
        },
        headers,
      };
    } else if (provider === LlmProviderId.OPENAI_CHATGPT_OAUTH) {
      const baseUrl = normalizeChatGptCodexBaseUrl(
        settings.llm?.openaiChatgptOauth?.baseUrl,
      );
      const model = (settings.llm?.openaiChatgptOauth?.model ?? '').trim();
      if (model.length === 0) {
        throw new FatalConfigError(
          'llm.provider is set to openai_chatgpt_oauth, but llm.openaiChatgptOauth.model is required.',
        );
      }

      const headers = normalizeHeaders(settings.llm?.headers);
      const internalModel = (
        settings.llm?.openaiChatgptOauth?.internalModel ?? ''
      ).trim();

      providerConfig = {
        provider: LlmProviderId.OPENAI_CHATGPT_OAUTH,
        baseUrl,
        model,
        internalModel: internalModel.length > 0 ? internalModel : undefined,
        headers,
      };
    } else if (provider === LlmProviderId.ANTHROPIC) {
      providerConfig = { provider: LlmProviderId.ANTHROPIC };
    } else {
      providerConfig = { provider: LlmProviderId.GEMINI };
    }

    const legacyAllowedMcpServers = getLegacyStringArraySetting(
      settings,
      'allowedMcpServers',
    );
    const legacyBlockedMcpServers = getLegacyStringArraySetting(
      settings,
      'blockedMcpServers',
    );
    const guiAutomationSettings = settings.tools?.guiAutomation;
    const guiAutomation = guiAutomationSettings
      ? (({ enabled: _enabled, ...rest }) => rest)(guiAutomationSettings)
      : undefined;

    const configParams: ConfigParameters = {
      sessionId: this.sessionId,
      targetDir: options.workspaceDir ?? process.cwd(),
      cwd: options.workspaceDir ?? process.cwd(),
      debugMode: !!process.env['DEBUG'],
      question: options.question,
      approvalMode,
      policyEngineConfig,
      model: resolvedModel,
      brain: {
        authority: isBrainAuthority(settings.brain?.authority)
          ? settings.brain?.authority
          : undefined,
        policyAuthority: policyBrainAuthority,
      },
      audit: {
        redactUiTypedText: settings.audit?.redactUiTypedText,
        retentionDays: settings.audit?.retentionDays,
        exportFormat: normalizeAuditExportFormat(
          settings.audit?.export?.format,
        ),
        exportRedaction: normalizeAuditExportRedaction(
          settings.audit?.export?.redaction,
        ),
      },
      recipes: {
        paths: settings.recipes?.paths,
        communityPaths: settings.recipes?.communityPaths,
        allowCommunity: settings.recipes?.allowCommunity,
        confirmCommunityOnFirstLoad:
          settings.recipes?.confirmCommunityOnFirstLoad,
        trustedCommunityRecipes: settings.recipes?.trustedCommunityRecipes,
      },
      showMemoryUsage: settings.ui?.showMemoryUsage || false,
      accessibility: settings.ui?.accessibility,
      usageStatisticsEnabled: settings.privacy?.usageStatisticsEnabled ?? true,
      checkpointing: settings.general?.checkpointing?.enabled,
      proxy:
        process.env['HTTPS_PROXY'] ||
        process.env['https_proxy'] ||
        process.env['HTTP_PROXY'] ||
        process.env['http_proxy'],
      bugCommand: settings.advanced?.bugCommand,
      maxSessionTurns: settings.model?.maxSessionTurns ?? -1,
      enableExtensionReloading: settings.experimental?.extensionReloading,
      experimentalJitContext: settings.experimental?.jitContext,
      noBrowser: !!process.env['NO_BROWSER'],
      summarizeToolOutput: settings.model?.summarizeToolOutput,
      compressionThreshold: settings.model?.compressionThreshold,
      folderTrust: settings.security?.folderTrust?.enabled,
      mcpServers: settings.mcpServers,
      allowedMcpServers: settings.mcp?.allowed ?? legacyAllowedMcpServers,
      blockedMcpServers: settings.mcp?.excluded ?? legacyBlockedMcpServers,
      useRipgrep: settings.tools?.useRipgrep,
      enableInteractiveShell:
        settings.tools?.shell?.enableInteractiveShell ?? true,
      skipNextSpeakerCheck: settings.model?.skipNextSpeakerCheck,
      enablePromptCompletion: settings.general?.enablePromptCompletion ?? false,
      truncateToolOutputThreshold: settings.tools?.truncateToolOutputThreshold,
      truncateToolOutputLines: settings.tools?.truncateToolOutputLines,
      enableToolOutputTruncation: settings.tools?.enableToolOutputTruncation,
      repl: {
        sandboxTier: normalizeReplSandboxTier(
          settings.tools?.repl?.sandboxTier,
        ),
        timeoutSeconds: settings.tools?.repl?.timeoutSeconds,
        dockerImage: settings.tools?.repl?.dockerImage,
      },
      guiAutomation,
      useSmartEdit: settings.useSmartEdit,
      useWriteTodos: settings.useWriteTodos,
      output: {
        format: normalizeOutputFormat(settings.output?.format),
      },
      providerConfig,
      codebaseInvestigatorSettings:
        settings.experimental?.codebaseInvestigatorSettings,
      introspectionAgentSettings:
        settings.experimental?.introspectionAgentSettings,
      retryFetchErrors: settings.general?.retryFetchErrors ?? false,
      enableHooks: settings.tools?.enableHooks ?? false,
      excludeTools: settings.tools?.exclude,
      hooks: settings.hooks,
      // Apply overrides
      ...(options.overrides || {}),
    };

    return new Config(ConfigSchema.parse(configParams));
  }
}

export function getSystemSettingsPath(): string {
  if (process.env['GEMINI_CLI_SYSTEM_SETTINGS_PATH']) {
    return process.env['GEMINI_CLI_SYSTEM_SETTINGS_PATH'];
  }
  if (platform() === 'darwin') {
    return '/Library/Application Support/GeminiCli/settings.json';
  } else if (platform() === 'win32') {
    return 'C:\\ProgramData\\gemini-cli\\settings.json';
  } else {
    return '/etc/gemini-cli/settings.json';
  }
}

export function getSystemDefaultsPath(): string {
  if (process.env['GEMINI_CLI_SYSTEM_DEFAULTS_PATH']) {
    return process.env['GEMINI_CLI_SYSTEM_DEFAULTS_PATH'];
  }
  return path.join(
    path.dirname(getSystemSettingsPath()),
    'system-defaults.json',
  );
}

export function findEnvFile(startDir: string): string | null {
  let currentDir = path.resolve(startDir);
  while (true) {
    const geminiEnvPath = path.join(currentDir, GEMINI_DIR, '.env');
    if (fs.existsSync(geminiEnvPath)) {
      return geminiEnvPath;
    }
    const envPath = path.join(currentDir, '.env');
    if (fs.existsSync(envPath)) {
      return envPath;
    }
    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir || !parentDir) {
      const homeGeminiEnvPath = path.join(homedir(), GEMINI_DIR, '.env');
      if (fs.existsSync(homeGeminiEnvPath)) {
        return homeGeminiEnvPath;
      }
      const homeEnvPath = path.join(homedir(), '.env');
      if (fs.existsSync(homeEnvPath)) {
        return homeEnvPath;
      }
      return null;
    }
    currentDir = parentDir;
  }
}

export function setUpCloudShellEnvironment(envFilePath: string | null): void {
  if (envFilePath && fs.existsSync(envFilePath)) {
    const envFileContent = fs.readFileSync(envFilePath);
    const parsedEnv = dotenv.parse(envFileContent);
    if (parsedEnv['GOOGLE_CLOUD_PROJECT']) {
      process.env['GOOGLE_CLOUD_PROJECT'] = parsedEnv['GOOGLE_CLOUD_PROJECT'];
    } else {
      process.env['GOOGLE_CLOUD_PROJECT'] = 'cloudshell-gca';
    }
  } else {
    process.env['GOOGLE_CLOUD_PROJECT'] = 'cloudshell-gca';
  }
}
