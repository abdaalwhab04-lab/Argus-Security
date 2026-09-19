/**
 * @license
 * Copyright 2025 Google LLC
 * Portions Copyright 2025 TerminaI Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { AuthConflictError } from '../../auth/llmAuthManager.js';
import type { LlmAuthManager } from '../../auth/llmAuthManager.js';
import { logger } from '../../utils/logger.js';

export function createAuthRouter(authManager: LlmAuthManager): Router {
  const router = Router();

  const isOpenAiChatGptOauthDisabled = (): boolean => {
    const raw = process.env['TERMINAI_DISABLE_OPENAI_CHATGPT_OAUTH'];
    if (raw === undefined) return false;
    const normalized = raw.trim().toLowerCase();
    return (
      normalized === '1' ||
      normalized === 'true' ||
      normalized === 'yes' ||
      normalized === 'on'
    );
  };

  // Task 12: GET /auth/status
  router.get('/status', (req: Request, res: Response) => {
    void (async () => {
      try {
        const result = await authManager.getStatus();
        res.json({
          status: result.status,
          authType: result.authType ?? null,
          ...(result.provider ? { provider: result.provider } : {}),
          ...(result.message ? { message: result.message } : {}),
          ...(result.errorCode ? { errorCode: result.errorCode } : {}),
        });
      } catch (e) {
        logger.error('[AuthRouter] Error getting status:', e);
        res.status(500).json({ error: 'Failed to check auth status' });
      }
    })();
  });

  // Task T3.2: POST /auth/provider - Switch provider from Desktop
  router.post('/provider', (req: Request, res: Response) => {
    void (async () => {
      try {
        const body = req.body as {
          provider: 'gemini' | 'openai_compatible' | 'openai_chatgpt_oauth';
          openaiCompatible?: {
            baseUrl: string;
            model: string;
            envVarName?: string;
          };
          openaiChatgptOauth?: {
            model: string;
            baseUrl?: string;
            internalModel?: string;
          };
        };

        if (
          body.provider !== 'gemini' &&
          body.provider !== 'openai_compatible' &&
          body.provider !== 'openai_chatgpt_oauth'
        ) {
          return res.status(400).json({
            error:
              "Invalid provider. Must be 'gemini', 'openai_compatible', or 'openai_chatgpt_oauth'.",
          });
        }

        // Validate OpenAI-compatible provider has required fields
        if (body.provider === 'openai_compatible') {
          if (
            !body.openaiCompatible?.baseUrl ||
            !body.openaiCompatible?.model
          ) {
            return res.status(400).json({
              error:
                "OpenAI-compatible provider requires 'openaiCompatible.baseUrl' and 'openaiCompatible.model'.",
            });
          }
        }

        if (body.provider === 'openai_chatgpt_oauth') {
          if (!body.openaiChatgptOauth?.model) {
            return res.status(400).json({
              error:
                "ChatGPT OAuth provider requires 'openaiChatgptOauth.model'.",
            });
          }
        }

        const result = await authManager.applyProviderSwitch(body);

        if ('statusCode' in result && typeof result.statusCode === 'number') {
          return res.status(result.statusCode).json({ error: result.error });
        }

        // Result is LlmAuthStatusResult
        const status =
          result as import('../../auth/llmAuthManager.js').LlmAuthStatusResult;
        return res.json({
          status: status.status,
          authType: status.authType ?? null,
          ...(status.provider ? { provider: status.provider } : {}),
          ...(status.message ? { message: status.message } : {}),
          ...(status.errorCode ? { errorCode: status.errorCode } : {}),
        });
      } catch (e) {
        logger.error('[AuthRouter] Error switching provider:', e);
        return res.status(500).json({ error: 'Failed to switch provider' });
      }
    })();
  });

  // Task 13: POST /gemini/api-key
  router.post('/gemini/api-key', (req: Request, res: Response) => {
    void (async () => {
      const apiKey = (req.body as { apiKey?: unknown }).apiKey;
      if (typeof apiKey !== 'string' || apiKey.trim().length === 0) {
        return res.status(400).json({ error: 'Invalid apiKey' });
      }
      try {
        const status = await authManager.submitGeminiApiKey(apiKey);
        return res.json({
          status: status.status,
          authType: status.authType ?? null,
          ...(status.message ? { message: status.message } : {}),
          ...(status.errorCode ? { errorCode: status.errorCode } : {}),
        });
      } catch (e) {
        logger.error('[AuthRouter] Error setting API key:', e);
        return res.status(500).json({ error: 'Failed to set API key' });
      }
    })();
  });

  // Task 14: POST /gemini/oauth/start
  router.post('/gemini/oauth/start', (req: Request, res: Response) => {
    void (async () => {
      try {
        const { authUrl } = await authManager.startGeminiOAuth();
        res.json({ authUrl });
      } catch (e) {
        if (e instanceof AuthConflictError) {
          res.status(409).json({ error: e.message });
          return;
        }
        logger.error('[AuthRouter] Error starting OAuth:', e);
        res.status(500).json({ error: 'Failed to start OAuth' });
      }
    })();
  });

  // Task 15: POST /gemini/oauth/cancel
  router.post('/gemini/oauth/cancel', (req: Request, res: Response) => {
    void (async () => {
      try {
        const status = await authManager.cancelGeminiOAuth();
        res.json({
          status: status.status,
          authType: status.authType ?? null,
          ...(status.message ? { message: status.message } : {}),
          ...(status.errorCode ? { errorCode: status.errorCode } : {}),
        });
      } catch (e) {
        logger.error('[AuthRouter] Error cancelling OAuth:', e);
        res.status(500).json({ error: 'Failed to cancel OAuth' });
      }
    })();
  });

  // Task 16: POST /gemini/vertex
  router.post('/gemini/vertex', (req: Request, res: Response) => {
    void (async () => {
      try {
        const status = await authManager.useGeminiVertex();
        res.json({
          status: status.status,
          authType: status.authType ?? null,
          ...(status.message ? { message: status.message } : {}),
          ...(status.errorCode ? { errorCode: status.errorCode } : {}),
        });
      } catch (e) {
        logger.error('[AuthRouter] Error setting Vertex environment:', e);
        res.status(500).json({ error: 'Failed to use Vertex AI' });
      }
    })();
  });

  // Task 30: POST /gemini/clear - Clear all Gemini auth state
  router.post('/gemini/clear', (req: Request, res: Response) => {
    void (async () => {
      try {
        const status = await authManager.clearGeminiAuth();
        res.json({
          status: status.status,
          authType: status.authType ?? null,
          ...(status.message ? { message: status.message } : {}),
          ...(status.errorCode ? { errorCode: status.errorCode } : {}),
        });
      } catch (e) {
        logger.error('[AuthRouter] Error clearing Gemini auth:', e);
        res.status(500).json({ error: 'Failed to clear authentication' });
      }
    })();
  });

  // OpenAI ChatGPT OAuth (Codex) endpoints
  router.post('/openai/oauth/start', (req: Request, res: Response) => {
    void (async () => {
      if (isOpenAiChatGptOauthDisabled()) {
        res.status(403).json({
          error:
            'ChatGPT OAuth provider is disabled by TERMINAI_DISABLE_OPENAI_CHATGPT_OAUTH. Use openai_compatible instead.',
        });
        return;
      }
      try {
        const { authUrl } = await authManager.startOpenAIOAuth();
        res.json({ authUrl });
      } catch (e) {
        if (e instanceof AuthConflictError) {
          res.status(409).json({ error: e.message });
          return;
        }
        logger.error('[AuthRouter] Error starting OpenAI OAuth:', e);
        res.status(500).json({ error: 'Failed to start OAuth' });
      }
    })();
  });

  router.post('/openai/oauth/complete', (req: Request, res: Response) => {
    void (async () => {
      if (isOpenAiChatGptOauthDisabled()) {
        res.status(403).json({
          error:
            'ChatGPT OAuth provider is disabled by TERMINAI_DISABLE_OPENAI_CHATGPT_OAUTH. Use openai_compatible instead.',
        });
        return;
      }
      try {
        const body = req.body as {
          redirectUrl?: unknown;
          code?: unknown;
          state?: unknown;
        };
        const status = await authManager.completeOpenAIOAuth({
          redirectUrl:
            typeof body.redirectUrl === 'string' ? body.redirectUrl : undefined,
          code: typeof body.code === 'string' ? body.code : undefined,
          state: typeof body.state === 'string' ? body.state : undefined,
        });
        res.json({
          status: status.status,
          authType: status.authType ?? null,
          ...(status.provider ? { provider: status.provider } : {}),
          ...(status.message ? { message: status.message } : {}),
          ...(status.errorCode ? { errorCode: status.errorCode } : {}),
        });
      } catch (e) {
        logger.error('[AuthRouter] Error completing OpenAI OAuth:', e);
        res.status(500).json({ error: 'Failed to complete OAuth' });
      }
    })();
  });

  router.post('/openai/oauth/cancel', (req: Request, res: Response) => {
    void (async () => {
      try {
        const status = await authManager.cancelOpenAIOAuth();
        res.json({
          status: status.status,
          authType: status.authType ?? null,
          ...(status.provider ? { provider: status.provider } : {}),
          ...(status.message ? { message: status.message } : {}),
          ...(status.errorCode ? { errorCode: status.errorCode } : {}),
        });
      } catch (e) {
        logger.error('[AuthRouter] Error cancelling OpenAI OAuth:', e);
        res.status(500).json({ error: 'Failed to cancel OAuth' });
      }
    })();
  });

  router.post('/openai/clear', (req: Request, res: Response) => {
    void (async () => {
      try {
        const status = await authManager.clearOpenAIAuth();
        res.json({
          status: status.status,
          authType: status.authType ?? null,
          ...(status.provider ? { provider: status.provider } : {}),
          ...(status.message ? { message: status.message } : {}),
          ...(status.errorCode ? { errorCode: status.errorCode } : {}),
        });
      } catch (e) {
        logger.error('[AuthRouter] Error clearing OpenAI auth:', e);
        res.status(500).json({ error: 'Failed to clear authentication' });
      }
    })();
  });

  return router;
}
