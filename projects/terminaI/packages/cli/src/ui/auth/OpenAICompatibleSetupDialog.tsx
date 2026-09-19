/**
 * @license
 * Copyright 2025 Google LLC
 * Portions Copyright 2025 TerminaI Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box, Text } from 'ink';
import { useMemo, useState } from 'react';
import { buildWizardSettingsPatch } from '@terminai/core';
import type { LoadedSettings } from '../../config/settings.js';
import { SettingScope } from '../../config/settings.js';
import { theme } from '../semantic-colors.js';
import { useTextBuffer } from '../components/shared/text-buffer.js';
import { TextInput } from '../components/shared/TextInput.js';
import { checkExhaustive } from '../../utils/checks.js';
import process from 'node:process';

type Step = 'base_url' | 'model' | 'env_var' | 'api_key';

interface Props {
  settings: LoadedSettings;
  terminalWidth?: number;
  onBack: () => void;
  onComplete: () => void | Promise<void>;
  onAuthError: (error: string | null) => void;
}

export function OpenAICompatibleSetupDialog({
  settings,
  terminalWidth,
  onBack,
  onComplete,
  onAuthError,
}: Props) {
  const viewportWidth = Math.max(
    20,
    (terminalWidth ?? process.stdout.columns ?? 80) - 8,
  );

  const [step, setStep] = useState<Step>('base_url');

  // Prefill from settings if available
  const openaiSettings = settings.merged.llm?.openaiCompatible;
  const defaultBaseUrl = openaiSettings?.baseUrl || 'http://localhost:11434/v1';
  const defaultModel = openaiSettings?.model || '';
  const defaultEnvVar = openaiSettings?.auth?.envVarName || 'OPENAI_API_KEY';

  const baseUrlBuffer = useTextBuffer({
    initialText: defaultBaseUrl,
    initialCursorOffset: defaultBaseUrl.length,
    viewport: { width: viewportWidth, height: 3 },
    isValidPath: () => false,
    inputFilter: (text) => text.replace(/[\r\n]/g, ''),
    singleLine: true,
  });

  const modelBuffer = useTextBuffer({
    initialText: defaultModel,
    initialCursorOffset: defaultModel.length,
    viewport: { width: viewportWidth, height: 3 },
    isValidPath: () => false,
    inputFilter: (text) => text.replace(/[\r\n]/g, ''),
    singleLine: true,
  });

  const envVarBuffer = useTextBuffer({
    initialText: defaultEnvVar,
    initialCursorOffset: defaultEnvVar.length,
    viewport: { width: viewportWidth, height: 3 },
    isValidPath: () => false,
    inputFilter: (text) => text.replace(/[\r\n]/g, ''),
    singleLine: true,
  });

  const apiKeyBuffer = useTextBuffer({
    initialText: '',
    initialCursorOffset: 0,
    viewport: { width: viewportWidth, height: 3 },
    isValidPath: () => false,
    inputFilter: (text) => text.replace(/[\r\n]/g, ''),
    singleLine: true,
  });

  const targetScope = useMemo(() => {
    const workspaceSettings = settings.forScope(
      SettingScope.Workspace,
    ).settings;
    const workspaceOpenai = workspaceSettings.llm?.openaiCompatible;
    const hasWorkspaceOverride =
      workspaceSettings.llm?.provider !== undefined ||
      workspaceSettings.llm?.openaiCompatible !== undefined ||
      workspaceSettings.llm?.openaiChatgptOauth !== undefined ||
      !!workspaceOpenai?.baseUrl ||
      !!workspaceOpenai?.model ||
      !!workspaceOpenai?.auth?.type ||
      !!workspaceOpenai?.auth?.envVarName;

    return hasWorkspaceOverride ? SettingScope.Workspace : SettingScope.User;
  }, [settings]);

  const { title, description, buffer, onSubmit } = useMemo(() => {
    switch (step) {
      case 'base_url':
        return {
          title: 'OpenAI Compatible setup',
          description:
            'Enter the base URL for your provider (http:// allowed for local).',
          buffer: baseUrlBuffer,
          onSubmit: () => {
            onAuthError(null);
            setStep('model');
          },
        };
      case 'model':
        return {
          title: 'OpenAI Compatible setup',
          description: 'Enter the model ID to use (e.g. gpt-4o, llama3).',
          buffer: modelBuffer,
          onSubmit: () => {
            onAuthError(null);
            setStep('env_var');
          },
        };
      case 'env_var':
        return {
          title: 'OpenAI Compatible setup',
          description:
            'Enter the environment variable name that holds your API key (e.g. OPENAI_API_KEY).',
          buffer: envVarBuffer,
          onSubmit: () => {
            onAuthError(null);

            const baseUrl = baseUrlBuffer.text.trim();
            const model = modelBuffer.text.trim();
            const envVarName = envVarBuffer.text.trim();

            if (!baseUrl) {
              onAuthError('Base URL is required.');
              setStep('base_url');
              return;
            }
            if (!model) {
              onAuthError('Model is required.');
              setStep('model');
              return;
            }
            if (!envVarName) {
              onAuthError('Env var name is required.');
              return;
            }

            setStep('api_key');
          },
        };
      case 'api_key':
        return {
          title: 'OpenAI Compatible setup',
          description:
            'Optional: paste your API key for this session now (press Enter to skip).',
          buffer: apiKeyBuffer,
          onSubmit: () => {
            onAuthError(null);

            const baseUrl = baseUrlBuffer.text.trim();
            const model = modelBuffer.text.trim();
            const envVarName = envVarBuffer.text.trim();
            const apiKey = apiKeyBuffer.text.trim();

            if (!baseUrl) {
              onAuthError('Base URL is required.');
              setStep('base_url');
              return;
            }
            if (!model) {
              onAuthError('Model is required.');
              setStep('model');
              return;
            }
            if (!envVarName) {
              onAuthError('Env var name is required.');
              setStep('env_var');
              return;
            }

            const patches = buildWizardSettingsPatch({
              provider: 'openai_compatible',
              openaiCompatible: { baseUrl, model, envVarName },
            });
            for (const patch of patches) {
              settings.setValue(targetScope, patch.path, patch.value);
            }

            if (apiKey.length > 0) {
              process.env[envVarName] = apiKey;
            }

            void onComplete();
          },
        };
      default:
        checkExhaustive(step);
        return {
          title: 'OpenAI Compatible setup',
          description:
            'Enter the base URL for your provider (http:// allowed for local).',
          buffer: baseUrlBuffer,
          onSubmit: () => {
            onAuthError(null);
            setStep('model');
          },
        };
    }
  }, [
    baseUrlBuffer,
    envVarBuffer,
    apiKeyBuffer,
    modelBuffer,
    onAuthError,
    settings,
    step,
    onComplete,
    setStep,
    targetScope,
  ]);

  return (
    <Box
      borderStyle="round"
      borderColor={theme.border.focused}
      flexDirection="column"
      padding={1}
      width="100%"
    >
      <Text bold color={theme.text.primary}>
        {title}
      </Text>
      <Box marginTop={1}>
        <Text color={theme.text.primary}>{description}</Text>
      </Box>

      <Box marginTop={1}>
        <Box
          borderStyle="round"
          borderColor={theme.border.default}
          paddingX={1}
          flexGrow={1}
        >
          <TextInput buffer={buffer} onSubmit={onSubmit} onCancel={onBack} />
        </Box>
      </Box>

      {(step === 'env_var' || step === 'api_key') && (
        <Box marginTop={1} flexDirection="column">
          <Text color={theme.text.secondary}>
            Your API key is NOT stored in settings.
          </Text>
          <Text color={theme.text.secondary}>
            Export it before running TerminaI:
          </Text>
          <Text color={theme.text.link}>
            {`export ${envVarBuffer.text || 'OPENAI_API_KEY'}='YOUR_KEY'`}
          </Text>
          <Text color={theme.text.secondary}>
            Saving config scope:{' '}
            {targetScope === SettingScope.Workspace ? 'workspace' : 'user'}
          </Text>
        </Box>
      )}

      <Box marginTop={1}>
        <Text color={theme.text.secondary}>
          (Press Enter to continue, Esc to go back)
        </Text>
      </Box>
    </Box>
  );
}
