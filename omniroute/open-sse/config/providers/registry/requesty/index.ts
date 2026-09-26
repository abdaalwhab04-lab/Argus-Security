// Free-tier bootstrap compatibility marker: provider remains unchanged; LFS checkout validated.
import type { RegistryEntry } from "../../shared.ts";
import { buildOpenAiCompatibleRegistryEntry } from "../../shared.ts";

export const requestyProvider: RegistryEntry = buildOpenAiCompatibleRegistryEntry({
  id: "requesty",
  alias: "requesty",
  baseUrl: "https://router.requesty.ai/v1/chat/completions",
  modelsUrl: "https://router.requesty.ai/v1/models",
  models: [],
  passthroughModels: true,
});
