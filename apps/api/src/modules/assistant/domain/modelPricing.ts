import type { TokenUsage } from './AssistantRun';

/** US$ per million tokens. */
interface ModelTariff {
  input: number;
  output: number;
  cacheRead: number;
  /** The 5-minute cache the model adapter uses: 1.25× input. */
  cacheWrite: number;
}

// Anthropic's list prices (2026-10). A model missing here is reported as
// unpriced instead of guessed: an estimate that looks exact but is not would
// mislead whoever judges the cost.
const TARIFFS: Partial<Record<string, ModelTariff>> = {
  'claude-sonnet-5-5': {
    input: 2,
    output: 10,
    cacheRead: 0.2,
    cacheWrite: 2.5,
  },
};

export interface ModelUsage {
  model: string;
  usage: TokenUsage;
}

export interface CostEstimate {
  usd: number;
  unpricedModels: string[];
}

export function estimateCost(usageByModel: ModelUsage[]): CostEstimate {
  let usd = 0;
  const unpricedModels: string[] = [];
  for (const { model, usage } of usageByModel) {
    const tariff = TARIFFS[model];
    if (!tariff) {
      unpricedModels.push(model);
      continue;
    }
    usd +=
      (usage.inputTokens * tariff.input +
        usage.outputTokens * tariff.output +
        usage.cacheReadTokens * tariff.cacheRead +
        usage.cacheWriteTokens * tariff.cacheWrite) /
      1_000_000;
  }
  return { usd, unpricedModels: unpricedModels.sort() };
}
