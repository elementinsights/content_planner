/**
 * Cost controls. Hard caps on provider/LLM call counts and a soft USD budget.
 * Every adapter calls `charge()` before an external request; exceeding a cap
 * throws BudgetExceededError so a run can never silently rack up spend.
 */
import { log } from './logger.ts';

export class BudgetExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BudgetExceededError';
  }
}

export interface CostLimits {
  maxProviderCalls: number;
  maxLlmCalls: number;
  maxUsd: number;
}

export class CostController {
  private providerCalls = 0;
  private llmCalls = 0;
  private usd = 0;
  constructor(private limits: CostLimits) {}

  /** Charge a provider (SEO/SERP) call with an estimated USD cost. */
  chargeProvider(estUsd = 0, label = 'provider'): void {
    this.providerCalls++;
    this.usd += estUsd;
    if (this.providerCalls > this.limits.maxProviderCalls) {
      throw new BudgetExceededError(
        `provider call cap exceeded (${this.limits.maxProviderCalls}) at ${label}`,
      );
    }
    if (this.usd > this.limits.maxUsd) {
      throw new BudgetExceededError(
        `USD budget exceeded ($${this.limits.maxUsd.toFixed(2)}) at ${label}`,
      );
    }
  }

  chargeLlm(estUsd = 0, label = 'llm'): void {
    this.llmCalls++;
    this.usd += estUsd;
    if (this.llmCalls > this.limits.maxLlmCalls) {
      throw new BudgetExceededError(`LLM call cap exceeded (${this.limits.maxLlmCalls}) at ${label}`);
    }
    if (this.usd > this.limits.maxUsd) {
      throw new BudgetExceededError(`USD budget exceeded ($${this.limits.maxUsd.toFixed(2)}) at ${label}`);
    }
  }

  summary() {
    return {
      providerCalls: this.providerCalls,
      llmCalls: this.llmCalls,
      estimatedUsd: Number(this.usd.toFixed(4)),
    };
  }

  report(): void {
    const s = this.summary();
    log.info('cost summary', s);
  }
}
