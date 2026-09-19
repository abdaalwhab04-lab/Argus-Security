/**
 * @license
 * Copyright 2025 Google LLC
 * Portions Copyright 2025 TerminaI Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi, type Mock, afterEach } from 'vitest';
import { ProviderWizard } from './ProviderWizard.js';
import { renderWithProviders } from '../../test-utils/render.js';
import type { LoadedSettings } from '../../config/settings.js';
import { SettingScope } from '../../config/settings.js';
import { RadioButtonSelect } from '../components/shared/RadioButtonSelect.js';

vi.mock('../components/shared/RadioButtonSelect.js', () => ({
  RadioButtonSelect: vi.fn(() => null),
}));

const mockedRadioButtonSelect = RadioButtonSelect as unknown as Mock;

function getRadioProps() {
  const call = mockedRadioButtonSelect.mock.calls.at(-1)?.[0] as
    | {
        onSelect: (value: string) => void;
        items: ReadonlyArray<{ value: string }>;
      }
    | undefined;
  if (!call) {
    throw new Error('RadioButtonSelect was not rendered');
  }
  return call;
}

describe('ProviderWizard', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('selecting gemini writes llm.provider and proceeds to gemini auth', () => {
    const settings = {
      merged: {},
      setValue: vi.fn(),
      forScope: vi.fn(() => ({ settings: {} })),
    } as unknown as LoadedSettings;

    const onSelectOpenAICompatible = vi.fn();
    const onSelectOpenAIChatGptOauth = vi.fn();
    const onProceedToGeminiAuth = vi.fn();
    const onAuthError = vi.fn();

    renderWithProviders(
      <ProviderWizard
        settings={settings}
        onSelectOpenAICompatible={onSelectOpenAICompatible}
        onSelectOpenAIChatGptOauth={onSelectOpenAIChatGptOauth}
        onProceedToGeminiAuth={onProceedToGeminiAuth}
        onAuthError={onAuthError}
      />,
    );

    getRadioProps().onSelect('gemini');

    expect(settings.setValue).toHaveBeenCalledWith(
      SettingScope.User,
      'llm.provider',
      'gemini',
    );
    expect(onProceedToGeminiAuth).toHaveBeenCalledOnce();
    expect(onSelectOpenAICompatible).not.toHaveBeenCalled();
    expect(onSelectOpenAIChatGptOauth).not.toHaveBeenCalled();
  });

  it('selecting openai_compatible proceeds to OpenAI setup without writing partial settings', () => {
    const settings = {
      merged: {},
      setValue: vi.fn(),
      forScope: vi.fn(() => ({ settings: {} })),
    } as unknown as LoadedSettings;

    const onSelectOpenAICompatible = vi.fn();
    const onSelectOpenAIChatGptOauth = vi.fn();
    const onProceedToGeminiAuth = vi.fn();
    const onAuthError = vi.fn();

    renderWithProviders(
      <ProviderWizard
        settings={settings}
        onSelectOpenAICompatible={onSelectOpenAICompatible}
        onSelectOpenAIChatGptOauth={onSelectOpenAIChatGptOauth}
        onProceedToGeminiAuth={onProceedToGeminiAuth}
        onAuthError={onAuthError}
      />,
    );

    getRadioProps().onSelect('openai_compatible');

    expect(onSelectOpenAICompatible).toHaveBeenCalledOnce();
    expect(onProceedToGeminiAuth).not.toHaveBeenCalled();
    expect(settings.setValue).not.toHaveBeenCalled();
  });

  it('selecting openai_chatgpt_oauth proceeds to ChatGPT OAuth setup without writing partial settings', () => {
    const settings = {
      merged: {},
      setValue: vi.fn(),
      forScope: vi.fn(() => ({ settings: {} })),
    } as unknown as LoadedSettings;

    const onSelectOpenAICompatible = vi.fn();
    const onSelectOpenAIChatGptOauth = vi.fn();
    const onProceedToGeminiAuth = vi.fn();
    const onAuthError = vi.fn();

    renderWithProviders(
      <ProviderWizard
        settings={settings}
        onSelectOpenAICompatible={onSelectOpenAICompatible}
        onSelectOpenAIChatGptOauth={onSelectOpenAIChatGptOauth}
        onProceedToGeminiAuth={onProceedToGeminiAuth}
        onAuthError={onAuthError}
      />,
    );

    getRadioProps().onSelect('openai_chatgpt_oauth');

    expect(onSelectOpenAIChatGptOauth).toHaveBeenCalledOnce();
    expect(onProceedToGeminiAuth).not.toHaveBeenCalled();
    expect(onSelectOpenAICompatible).not.toHaveBeenCalled();
    expect(settings.setValue).not.toHaveBeenCalled();
  });

  it('hides openai_chatgpt_oauth when disabled by env var', () => {
    vi.stubEnv('TERMINAI_DISABLE_OPENAI_CHATGPT_OAUTH', '1');

    const settings = {
      merged: {},
      setValue: vi.fn(),
      forScope: vi.fn(() => ({ settings: {} })),
    } as unknown as LoadedSettings;

    renderWithProviders(
      <ProviderWizard
        settings={settings}
        onSelectOpenAICompatible={vi.fn()}
        onSelectOpenAIChatGptOauth={vi.fn()}
        onProceedToGeminiAuth={vi.fn()}
        onAuthError={vi.fn()}
      />,
    );

    const values = getRadioProps().items.map((item) => item.value);
    expect(values).not.toContain('openai_chatgpt_oauth');
    expect(values).toContain('openai_compatible');
    expect(values).toContain('gemini');
  });
});
