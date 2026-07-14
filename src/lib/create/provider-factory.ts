import { LocalFallbackProvider } from "./provider";
import { VolcengineArkCreateProvider } from "./volcengine-ark-provider";

export function createGenerationProvider(environment: NodeJS.ProcessEnv = process.env) {
  const apiKey = environment.ARK_API_KEY?.trim();
  const modelId = environment.ARK_MODEL_ID?.trim();
  if (apiKey && modelId) return new VolcengineArkCreateProvider(apiKey, modelId);
  return new LocalFallbackProvider();
}

export function hasRealGenerationProvider(environment: NodeJS.ProcessEnv = process.env) {
  return Boolean(environment.ARK_API_KEY?.trim() && environment.ARK_MODEL_ID?.trim());
}
