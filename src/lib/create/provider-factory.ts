import { CreateProviderError } from "./provider";
import { VolcengineArkCreateProvider } from "./volcengine-ark-provider";

export function createGenerationProvider(environment: NodeJS.ProcessEnv = process.env) {
  const apiKey = environment.ARK_API_KEY?.trim();
  const modelId = environment.ARK_MODEL_ID?.trim();
  if (!apiKey) throw new CreateProviderError("api_key_missing", "火山方舟 API Key 尚未配置，可改用本地演示生成。");
  if (!modelId) throw new CreateProviderError("model_id_missing", "火山方舟模型 ID 尚未配置，可改用本地演示生成。");
  return new VolcengineArkCreateProvider(apiKey, modelId);
}

export function hasRealGenerationProvider(environment: NodeJS.ProcessEnv = process.env) {
  return Boolean(environment.ARK_API_KEY?.trim() && environment.ARK_MODEL_ID?.trim());
}
