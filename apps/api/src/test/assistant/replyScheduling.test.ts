import { describe, expect, it, vi } from 'vitest';
import type { ClaimedBatch } from '../../modules/assistant/application/ports/out/PendingRepliesRepositoryPort';
import { ReplyToDueChatsUseCase } from '../../modules/assistant/application/use-cases/ReplyToDueChatsUseCase';
import { ScheduleReplyUseCase } from '../../modules/assistant/application/use-cases/ScheduleReplyUseCase';
import { DEFAULT_ASSISTANT_SETTINGS } from '../../modules/assistant/domain/AssistantSettings';

const NOW = new Date('2026-10-22T15:00:00Z');

function queue(claimed: ClaimedBatch[] = []) {
  return {
    add: vi.fn(async (): Promise<void> => undefined),
    claimDue: vi.fn(async (): Promise<ClaimedBatch[]> => claimed),
    release: vi.fn(async (_batch: ClaimedBatch): Promise<void> => undefined),
  };
}

describe('ScheduleReplyUseCase', () => {
  function setup(enabled = true) {
    const pending = queue();
    const useCase = new ScheduleReplyUseCase(
      {
        get: async () => ({
          ...DEFAULT_ASSISTANT_SETTINGS,
          enabled,
          debounceSeconds: 5,
          maxWaitSeconds: 20,
        }),
      },
      pending,
      { now: () => NOW }
    );
    const schedule = (type = 'text') =>
      useCase.execute({ conversationId: 'c-1', messageId: 'in-1', type });
    return { schedule, pending };
  }

  it('queues the message with the wait from the settings', async () => {
    const { schedule, pending } = setup();

    expect(await schedule()).toBe('scheduled');
    expect(pending.add).toHaveBeenCalledWith('c-1', 'in-1', NOW, {
      debounceSeconds: 5,
      maxWaitSeconds: 20,
    });
  });

  it('queues an image too: the turn hands it over', async () => {
    const { schedule } = setup();

    expect(await schedule('image')).toBe('scheduled');
  });

  it('switched off, queues nothing', async () => {
    const { schedule, pending } = setup(false);

    expect(await schedule()).toBe('disabled');
    expect(pending.add).not.toHaveBeenCalled();
  });

  it('ignores a reaction: nothing to answer or hand over', async () => {
    const { schedule, pending } = setup();

    expect(await schedule('reaction')).toBe('ignored');
    expect(pending.add).not.toHaveBeenCalled();
  });
});

describe('ReplyToDueChatsUseCase', () => {
  const A: ClaimedBatch = {
    conversationId: 'c-a',
    messageIds: ['a1', 'a2'],
    claimedAt: NOW,
  };
  const B: ClaimedBatch = {
    conversationId: 'c-b',
    messageIds: ['b1'],
    claimedAt: NOW,
  };

  it('runs one turn per due chat with all its messages, then releases it', async () => {
    const pending = queue([A, B]);
    const turn = vi.fn(async () => 'answered' as const);
    const useCase = new ReplyToDueChatsUseCase(
      pending,
      { execute: turn },
      { now: () => NOW }
    );

    expect(await useCase.execute()).toBe(2);
    expect(pending.claimDue).toHaveBeenCalledWith({
      now: NOW,
      staleBefore: new Date('2026-10-22T14:58:00Z'),
      limit: 10,
    });
    expect(turn).toHaveBeenCalledWith({
      conversationId: 'c-a',
      messageIds: ['a1', 'a2'],
    });
    expect(turn).toHaveBeenCalledWith({
      conversationId: 'c-b',
      messageIds: ['b1'],
    });
    expect(pending.release).toHaveBeenCalledWith(A);
    expect(pending.release).toHaveBeenCalledWith(B);
  });

  it('a failing turn does not stop the others, and is released anyway', async () => {
    const pending = queue([A, B]);
    const turn = vi.fn(
      async ({ conversationId }: { conversationId: string }) => {
        if (conversationId === 'c-a') throw new Error('base caída');
        return 'answered' as const;
      }
    );
    const useCase = new ReplyToDueChatsUseCase(
      pending,
      { execute: turn },
      { now: () => NOW }
    );

    await expect(useCase.execute()).rejects.toThrow('base caída');
    expect(turn).toHaveBeenCalledTimes(2);
    expect(pending.release).toHaveBeenCalledWith(A);
    expect(pending.release).toHaveBeenCalledWith(B);
  });
});
