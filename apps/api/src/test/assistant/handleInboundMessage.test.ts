import { describe, expect, it, vi } from 'vitest';
import type { ModelReply } from '../../modules/assistant/application/ports/out/AssistantModelPort';
import type { ChannelChat } from '../../modules/assistant/application/ports/out/ChatChannelPort';
import { HandleInboundMessageUseCase } from '../../modules/assistant/application/use-cases/HandleInboundMessageUseCase';
import { ModelUnavailableError } from '../../modules/assistant/domain/AssistantErrors';
import type { NewAssistantRun } from '../../modules/assistant/domain/AssistantRun';
import { DEFAULT_ASSISTANT_SETTINGS } from '../../modules/assistant/domain/AssistantSettings';

const NOW = new Date('2026-10-21T15:00:00Z');
const USAGE = {
  inputTokens: 40,
  outputTokens: 20,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
};
const REPLY: ModelReply = {
  text: 'Catia queda en la Av. Sucre.',
  model: 'claude-sonnet-5-5',
  usage: USAGE,
};
const CHAT: ChannelChat = {
  waId: '584140000001',
  lastInboundAt: new Date(NOW.getTime() - 60_000),
  messages: [
    {
      id: 'in-1',
      source: 'customer',
      type: 'text',
      body: 'hola',
      status: null,
    },
    {
      id: 'in-2',
      source: 'customer',
      type: 'text',
      body: '¿dónde queda Catia?',
      status: null,
    },
  ],
};

function setup({
  reply = vi.fn(async () => REPLY),
  send = vi.fn(async () => ({ id: 'out-1' })),
  record = vi.fn(async (_run: NewAssistantRun) => {}),
}: {
  reply?: () => Promise<ModelReply>;
  send?: () => Promise<{ id: string }>;
  record?: (run: NewAssistantRun) => Promise<void>;
} = {}) {
  const useCase = new HandleInboundMessageUseCase(
    { get: async () => ({ ...DEFAULT_ASSISTANT_SETTINGS, enabled: true }) },
    { read: async () => CHAT, sendAsAssistant: send },
    { current: async () => [] },
    { reply },
    { record },
    { now: () => NOW }
  );
  const turn = (messageId = 'in-2') =>
    useCase.execute({ conversationId: 'c-1', messageId, type: 'text' });
  return { turn, reply, send, record };
}

describe('HandleInboundMessageUseCase', () => {
  it('answers once and records the turn', async () => {
    const { turn, send, record } = setup();

    expect(await turn()).toBe('answered');
    expect(send).toHaveBeenCalledTimes(1);
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        inboundMessageIds: ['in-2'],
        sentMessageId: 'out-1',
        outcome: 'answered',
        usage: USAGE,
      })
    );
  });

  it('leaves an older message to the turn of the newest one', async () => {
    const { turn, reply, record } = setup();

    expect(await turn('in-1')).toBe('ignored');
    expect(reply).not.toHaveBeenCalled();
    expect(record).not.toHaveBeenCalled();
  });

  it('keeps the tokens Anthropic billed when the reply is unusable', async () => {
    const { turn, record } = setup({
      reply: vi.fn(async () => {
        throw new ModelUnavailableError('refusal', 'se negó', {
          model: 'claude-sonnet-5-5',
          usage: USAGE,
        });
      }),
    });

    expect(await turn()).toBe('error');
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: 'error',
        reason: 'refusal',
        model: 'claude-sonnet-5-5',
        usage: USAGE,
      })
    );
  });

  it('records a failed send with the model and tokens it cost', async () => {
    const { turn, record } = setup({
      send: vi.fn(async () => {
        throw new Error('Meta rechazó el envío');
      }),
    });

    expect(await turn()).toBe('error');
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: 'error',
        reason: 'send_failed',
        sentMessageId: null,
        usage: USAGE,
      })
    );
  });

  it('never logs a reply that went out as failed', async () => {
    const record = vi.fn(async () => {
      throw new Error('base caída');
    });
    const { turn, send } = setup({ record });

    await expect(turn()).rejects.toThrow('base caída');
    expect(send).toHaveBeenCalledTimes(1);
    expect(record).toHaveBeenCalledTimes(1);
  });
});
