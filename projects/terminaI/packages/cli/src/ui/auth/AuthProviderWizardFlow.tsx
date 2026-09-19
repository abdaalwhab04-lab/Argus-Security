/**
 * @license
 * Copyright 2025 Google LLC
 * Portions Copyright 2025 TerminaI Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box, Text } from 'ink';
import { useState } from 'react';
import type { LoadedSettings } from '../../config/settings.js';
import { theme } from '../semantic-colors.js';
import { OpenAICompatibleSetupDialog } from './OpenAICompatibleSetupDialog.js';
import { OpenAIChatGptOAuthSetupDialog } from './OpenAIChatGptOAuthSetupDialog.js';
import { ProviderWizard } from './ProviderWizard.js';

type Step =
  | 'provider'
  | 'openai_compatible_setup'
  | 'openai_chatgpt_oauth_setup';

interface Props {
  settings: LoadedSettings;
  terminalWidth: number;
  onComplete: () => void;
}

export function AuthProviderWizardFlow({
  settings,
  terminalWidth,
  onComplete,
}: Props) {
  const [step, setStep] = useState<Step>('provider');
  const [authError, setAuthError] = useState<string | null>(null);

  return (
    <Box flexDirection="column" width="100%">
      {authError && (
        <Box marginBottom={1}>
          <Text color={theme.status.error}>{authError}</Text>
        </Box>
      )}

      {step === 'provider' ? (
        <ProviderWizard
          settings={settings}
          onAuthError={setAuthError}
          onSelectOpenAICompatible={() => {
            setAuthError(null);
            setStep('openai_compatible_setup');
          }}
          onSelectOpenAIChatGptOauth={() => {
            setAuthError(null);
            setStep('openai_chatgpt_oauth_setup');
          }}
          onProceedToGeminiAuth={() => {
            setAuthError(null);
            onComplete();
          }}
        />
      ) : step === 'openai_compatible_setup' ? (
        <OpenAICompatibleSetupDialog
          settings={settings}
          terminalWidth={terminalWidth}
          onAuthError={setAuthError}
          onBack={() => {
            setAuthError(null);
            setStep('provider');
          }}
          onComplete={() => {
            setAuthError(null);
            onComplete();
          }}
        />
      ) : (
        <OpenAIChatGptOAuthSetupDialog
          settings={settings}
          terminalWidth={terminalWidth}
          onAuthError={setAuthError}
          onBack={() => {
            setAuthError(null);
            setStep('provider');
          }}
          onComplete={() => {
            setAuthError(null);
            onComplete();
          }}
        />
      )}
    </Box>
  );
}
