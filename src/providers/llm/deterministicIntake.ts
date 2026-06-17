/**
 * Deterministic intake provider — DEFAULT. No network, no keys. Wraps the pure
 * intake core so the registry can treat it like any LLMIntakeProvider.
 */
import type { LLMIntakeProvider } from '../interfaces.ts';
import type { PlanInput, IntakeResult } from '../../core/types.ts';
import type { AppConfig } from '../../config/env.ts';
import { deterministicInterpret, finalizeIntake } from '../../intake/core.ts';

export class DeterministicIntakeProvider implements LLMIntakeProvider {
  readonly name = 'deterministic-intake';
  readonly provider = 'deterministic' as const;
  constructor(private cfg: AppConfig) {}

  async interpret(input: PlanInput): Promise<IntakeResult> {
    const creative = deterministicInterpret(input, this.cfg);
    return finalizeIntake(creative, input, this.cfg, 'deterministic');
  }
}
