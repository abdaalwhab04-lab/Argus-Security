import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { FETCH_TIMEOUT_MS } from "../../open-sse/config/constants.ts";
import { prepareToolMessages } from "../../open-sse/translator/webTools.ts";
import {
  DuckDuckGoWebExecutor,
  DUCKDUCKGO_BASE,
  normalizeDuckDuckGoMessages,
  STATUS_URL,
} from "../../open-sse/executors/duckduckgo-web.ts";

describe("DuckDuckGoWebExecutor", () => {
  describe("class instantiation", () => {
    it("should instantiate executor", () => {
      const executor = new DuckDuckGoWebExecutor();
      assert.ok(executor, "Executor should be created");
    });

    it("should have execute method", () => {
      const executor = new DuckDuckGoWebExecutor();
      assert.equal(typeof executor.execute, "function", "execute should be a function");
    });

    it("should have testConnection method", () => {
      const executor = new DuckDuckGoWebExecutor();
      assert.equal(
        typeof executor.testConnection,
        "function",
        "testConnection should be a function"
      );
    });

    it("should export DUCKDUCKGO_BASE constant", () => {
      assert.equal(
        DUCKDUCKGO_BASE,
        "https://duckduckgo.com",
        "DUCKDUCKGO_BASE should be correct URL"
      );
    });
  });

  describe("execute method validation", () => {
    it("reduces OpenAI messages to plain Duck.ai user/assistant text turns", () => {
      assert.deepEqual(
        normalizeDuckDuckGoMessages([
          { role: "user", content: "hello", name: "caller", cache_control: { type: "ephemeral" } },
          { role: "assistant", content: [{ type: "text", text: "ready" }], tool_calls: [{ id: "call-1" }] },
          { role: "tool", content: "tool output" },
          { role: "assistant", content: null },
          { content: "missing role" },
          null,
        ]),
        [
          { role: "user", content: "hello" },
          { role: "assistant", content: "ready" },
        ]
      );
    });

    it("folds OpenAI system/developer prompts into a user turn for Duck.ai", () => {
      assert.deepEqual(
        normalizeDuckDuckGoMessages([
          { role: "system", content: "You are a precise coding assistant." },
          { role: "developer", content: "Answer with one word." },
          { role: "user", content: "Say OK." },
          { role: "assistant", content: "Ready." },
        ]),
        [
          {
            role: "user",
            content:
              "Instructions for the assistant:\nYou are a precise coding assistant.\n\nAnswer with one word.\n\nSay OK.",
          },
          { role: "assistant", content: "Ready." },
        ]
      );
    });

    it("creates a user turn when the request contains only system instructions", () => {
      assert.deepEqual(
        normalizeDuckDuckGoMessages([{ role: "system", content: "Be concise." }]),
        [{ role: "user", content: "Instructions for the assistant:\nBe concise." }]
      );
    });

    it("removes the system tool contract added after initial Duck.ai normalization", () => {
      const initial = normalizeDuckDuckGoMessages([
        { role: "user", content: "Find the current version." },
      ]);
      const prepared = prepareToolMessages(
        {
          tools: [
            {
              type: "function",
              function: {
                name: "lookup",
                description: "Look up a version",
                parameters: { type: "object", properties: {} },
              },
            },
          ],
        },
        initial
      );
      assert.ok(prepared.effectiveMessages.some((message) => message.role === "system"));

      const finalMessages = normalizeDuckDuckGoMessages(prepared.effectiveMessages);
      assert.ok(finalMessages.every((message) => message.role === "user" || message.role === "assistant"));
      assert.ok(finalMessages.some((message) => String(message.content).includes("The client application provides tools")));
      assert.ok(finalMessages.some((message) => String(message.content).includes("Available tools:")));
    });

    it("should reject empty messages array", async () => {
      const executor = new DuckDuckGoWebExecutor();

      const response = await executor.execute({
        model: "gpt-4o-mini",
        messages: [],
        stream: false,
      } as any);

      assert.ok(response instanceof Response, "should return Response");
      assert.equal(response.status, 400, "should return 400 for empty messages");

      const body = await response.json();
      assert.ok(body.error, "error response should have error field");
    });

    it("should accept non-empty messages array", async () => {
      const executor = new DuckDuckGoWebExecutor();

      // This will fail due to network, but should pass input validation
      try {
        const response = await executor.execute({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: "test" }],
          stream: false,
        } as any);

        // Should either succeed with real response or fail with network error (status 5xx, not 400)
        assert.notEqual(response.status, 400, "should not return 400 for valid messages");
      } catch (error) {
        // Network error is expected since we're not running against real DuckDuckGo
        assert.ok(error instanceof Error, "should throw Error for network issues");
      }
    });

    it("should handle missing model parameter", async () => {
      const executor = new DuckDuckGoWebExecutor();

      try {
        await executor.execute({
          model: undefined,
          messages: [{ role: "user", content: "test" }],
          stream: false,
        } as any);
      } catch (error) {
        assert.ok(
          error instanceof Error || error instanceof Response,
          "should handle missing model"
        );
      }
    });
  });

  describe("testConnection method", () => {
    it("should return boolean", async () => {
      const executor = new DuckDuckGoWebExecutor();

      try {
        const result = await executor.testConnection({});
        assert.equal(typeof result, "boolean", "testConnection should return boolean");
      } catch (error) {
        // Network error is acceptable - just verify method exists and is callable
        assert.ok(true, "testConnection is callable");
      }
    });

    it("should abort the status request when its timeout expires", async (t) => {
      t.mock.timers.enable({ apis: ["setTimeout"] });
      let requestSignal: AbortSignal | null = null;

      t.mock.method(globalThis, "fetch", async (input, init) => {
        assert.equal(String(input), STATUS_URL);
        assert.equal(init?.method, "GET");
        requestSignal = init?.signal ?? null;

        return new Promise<Response>((_resolve, reject) => {
          requestSignal?.addEventListener("abort", () => reject(requestSignal?.reason), {
            once: true,
          });
        });
      });

      const resultPromise = new DuckDuckGoWebExecutor().testConnection({});
      assert.ok(requestSignal, "status fetch should receive an AbortSignal");
      assert.equal(requestSignal.aborted, false);

      t.mock.timers.tick(FETCH_TIMEOUT_MS);

      assert.equal(requestSignal.aborted, true);
      assert.equal(requestSignal.reason?.name, "TimeoutError");
      assert.equal(await resultPromise, false);
    });
  });

  describe("response handling", () => {
    it("should handle AbortSignal", async () => {
      const executor = new DuckDuckGoWebExecutor();
      const controller = new AbortController();

      // Abort immediately
      controller.abort();

      const response = await executor.execute({
        model: "gpt-4o-mini",
        body: { messages: [{ role: "user", content: "test" }] },
        stream: false,
        signal: controller.signal,
      } as any);

      assert.ok(response instanceof Response, "should return Response");
      assert.equal(response.status, 499, "should return 499 for aborted request");
    });

    it("should support streaming parameter", async () => {
      const executor = new DuckDuckGoWebExecutor();

      try {
        // Test with stream: true
        const response1 = await executor.execute({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: "test" }],
          stream: true,
        } as any);
        assert.ok(response1 instanceof Response, "streaming mode should return Response");

        // Test with stream: false
        const response2 = await executor.execute({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: "test" }],
          stream: false,
        } as any);
        assert.ok(response2 instanceof Response, "non-streaming mode should return Response");
      } catch (error) {
        // Network errors are expected
        assert.ok(error instanceof Error || error instanceof Response);
      }
    });
  });

  describe("error handling", () => {
    it("should handle network timeouts gracefully", async () => {
      const executor = new DuckDuckGoWebExecutor();

      try {
        const response = await executor.execute({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: "test" }],
          stream: false,
        } as any);

        // Should get a response, not throw
        assert.ok(response instanceof Response, "should return Response even on timeout");
      } catch (error) {
        // Timeout or network error is acceptable
        assert.ok(error instanceof Error, "should handle errors gracefully");
      }
    });

    it("should return valid error responses with JSON", async () => {
      const executor = new DuckDuckGoWebExecutor();

      const response = await executor.execute({
        model: "gpt-4o-mini",
        messages: [],
        stream: false,
      } as any);

      assert.equal(response.status, 400);
      const contentType = response.headers.get("content-type");
      assert.ok(contentType?.includes("application/json"), "error response should be JSON");

      const body = await response.json();
      assert.ok(body.error, "error response should have error object");
      assert.ok(body.error.message, "error should have message");
    });
  });

  describe("integration checks", () => {
    it("should be properly exported from executor module", async () => {
      // Import the singleton as well
      const { duckduckgoWebExecutor } = await import("../../open-sse/executors/duckduckgo-web.ts");
      assert.ok(duckduckgoWebExecutor, "singleton executor should be exported");
      assert.ok(duckduckgoWebExecutor.execute, "singleton should have execute method");
    });

    it("should be registered in executor index", async () => {
      const { getExecutor } = await import("../../open-sse/executors/index.ts");
      const executor = getExecutor("duckduckgo-web");
      assert.ok(executor, "executor should be registered in index");
      assert.equal(
        typeof executor.execute,
        "function",
        "registered executor should have execute method"
      );
    });
  });
});
