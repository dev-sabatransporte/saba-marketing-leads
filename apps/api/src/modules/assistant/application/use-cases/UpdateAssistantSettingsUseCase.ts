import { Inject, Injectable } from '@nestjs/common';
import {
  type AssistantSettings,
  type AssistantSettingsWithChanges,
  changedSettings,
  maxWaitIsBelowDebounce,
} from '../../domain/AssistantSettings';
import { MaxWaitBelowDebounceException } from '../../domain/exceptions/MaxWaitBelowDebounceException';
import { ASSISTANT_TOKENS } from '../../tokens';
import type { UpdateAssistantSettingsPort } from '../ports/in/AssistantSettingsPort';
import type { ManagedAssistantSettingsRepositoryPort } from '../ports/out/AssistantSettingsRepositoryPort';
import type { ClockPort } from '../ports/out/ClockPort';

/**
 * Turns are not told: each one reads the settings row, so a change applies
 * from the next turn on.
 */
@Injectable()
export class UpdateAssistantSettingsUseCase
  implements UpdateAssistantSettingsPort
{
  constructor(
    @Inject(ASSISTANT_TOKENS.Settings)
    private readonly settings: ManagedAssistantSettingsRepositoryPort,
    @Inject(ASSISTANT_TOKENS.Clock) private readonly clock: ClockPort
  ) {}

  async execute(input: {
    patch: Partial<AssistantSettings>;
    changedBy: { id: string; name: string };
  }): Promise<AssistantSettingsWithChanges> {
    const current = await this.settings.getWithChanges();
    const changed = changedSettings(current.settings, input.patch);
    if (changed.length === 0) return current;

    const next: AssistantSettings = { ...current.settings, ...input.patch };
    if (maxWaitIsBelowDebounce(next)) throw new MaxWaitBelowDebounceException();

    return this.settings.save(next, changed, {
      changedBy: input.changedBy,
      changedAt: this.clock.now(),
    });
  }
}
