import { describe, expect, it, vi } from 'vitest';
import type { ModelReply } from '../../modules/assistant/application/ports/out/AssistantModelPort';
import type { ChannelChat } from '../../modules/assistant/application/ports/out/ChatChannelPort';
import type { StoresSnapshot } from '../../modules/assistant/application/ports/out/StoresSourcePort';
import { HandleInboundMessageUseCase } from '../../modules/assistant/application/use-cases/HandleInboundMessageUseCase';
import { ModelUnavailableError } from '../../modules/assistant/domain/AssistantErrors';
import type { NewAssistantRun } from '../../modules/assistant/domain/AssistantRun';
import { DEFAULT_ASSISTANT_SETTINGS } from '../../modules/assistant/domain/AssistantSettings';
import {
  HANDOFF_NOTICE,
  handoffNotice,
} from '../../modules/assistant/domain/handoff';

const NOW = new Date('2026-10-21T15:00:00Z');
const USAGE = {
  inputTokens: 40,
  outputTokens: 20,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
};
const ANSWER_TEXT = 'Catia queda en la Av. Sucre.';
const ANSWER: ModelReply = {
  kind: 'answer',
  text: ANSWER_TEXT,
  model: 'claude-sonnet-5-5',
  usage: USAGE,
};
const CHAT: ChannelChat = {
  waId: '584140000001',
  lastInboundAt: new Date(NOW.getTime() - 60_000),
  handoffRequestedAt: null,
  assigned: false,
  personReplied: false,
  assistantPaused: false,
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
  chat = CHAT,
  chatWhenSending = chat,
  stores = { stores: [], misconfigured: false },
  reply = vi.fn(async (): Promise<ModelReply> => ANSWER),
  send = vi.fn(async (_id: string, _body: string) => ({ id: 'out-1' })),
  record = vi.fn(async (_run: NewAssistantRun): Promise<void> => undefined),
}: {
  chat?: ChannelChat;
  /** What the chat looks like once the model has answered. */
  chatWhenSending?: ChannelChat;
  stores?: StoresSnapshot;
  reply?: () => Promise<ModelReply>;
  send?: (id: string, body: string) => Promise<{ id: string }>;
  record?: (run: NewAssistantRun) => Promise<void>;
} = {}) {
  const requestHandoff = vi.fn(async (): Promise<void> => undefined);
  const useCase = new HandleInboundMessageUseCase(
    { get: async () => ({ ...DEFAULT_ASSISTANT_SETTINGS, enabled: true }) },
    {
      read: vi.fn(async () => chatWhenSending).mockResolvedValueOnce(chat),
      sendAsAssistant: send,
      requestHandoff,
    },
    { current: async () => stores },
    { reply },
    { record },
    { now: () => NOW }
  );
  const turn = (messageId = 'in-2', type = 'text') =>
    useCase.execute({ conversationId: 'c-1', messageId, type });
  return { turn, reply, send, record, requestHandoff };
}

describe('HandleInboundMessageUseCase', () => {
  it('answers once and records the turn', async () => {
    const { turn, send, record, requestHandoff } = setup();

    expect(await turn()).toBe('answered');
    expect(send).toHaveBeenCalledWith('c-1', ANSWER_TEXT);
    expect(requestHandoff).not.toHaveBeenCalled();
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

  it('stays silent while the chat waits for a person', async () => {
    const { turn, reply, send } = setup({
      chat: { ...CHAT, handoffRequestedAt: NOW },
    });

    expect(await turn()).toBe('ignored');
    expect(reply).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it.each([
    ['assigned to someone', { assigned: true }],
    [
      'answered by a person from the panel or the phone',
      { personReplied: true },
    ],
    ['paused', { assistantPaused: true }],
  ] as const)('stays silent while the chat is %s', async (_case, attention) => {
    const { turn, reply, send, requestHandoff } = setup({
      chat: { ...CHAT, ...attention },
    });

    expect(await turn()).toBe('ignored');
    expect(reply).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
    expect(requestHandoff).not.toHaveBeenCalled();
  });

  it('stays silent with a person on it even for an image', async () => {
    const { turn, requestHandoff } = setup({
      chat: { ...CHAT, personReplied: true },
    });

    expect(await turn('in-2', 'image')).toBe('ignored');
    expect(requestHandoff).not.toHaveBeenCalled();
  });

  it('does not send if a person took the chat while the model was answering', async () => {
    const { turn, send, requestHandoff, record } = setup({
      chatWhenSending: { ...CHAT, personReplied: true },
    });

    expect(await turn()).toBe('ignored');
    expect(send).not.toHaveBeenCalled();
    expect(requestHandoff).not.toHaveBeenCalled();
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: 'error',
        reason: 'person_took_over',
        sentMessageId: null,
        usage: USAGE,
      })
    );
  });

  it('hands over with the reason the model chose, with a fixed notice', async () => {
    const { turn, send, requestHandoff, record } = setup({
      reply: vi.fn(
        async (): Promise<ModelReply> => ({
          kind: 'handoff',
          reason: 'pricing',
          model: 'claude-sonnet-5-5',
          usage: USAGE,
        })
      ),
    });

    expect(await turn()).toBe('handoff');
    expect(send).toHaveBeenCalledWith('c-1', HANDOFF_NOTICE);
    expect(requestHandoff).toHaveBeenCalledWith('c-1', 'pricing');
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: 'handoff',
        reason: 'pricing',
        sentMessageId: 'out-1',
        usage: USAGE,
      })
    );
  });

  it('tells the customer the model is carried when it is out of stock', async () => {
    const { turn, send, requestHandoff } = setup({
      reply: vi.fn(
        async (): Promise<ModelReply> => ({
          kind: 'handoff',
          reason: 'out_of_stock',
          model: 'claude-sonnet-5-5',
          usage: USAGE,
        })
      ),
    });

    expect(await turn()).toBe('handoff');
    expect(requestHandoff).toHaveBeenCalledWith('c-1', 'out_of_stock');
    expect(send).toHaveBeenCalledWith('c-1', handoffNotice('out_of_stock'));
  });

  it('never sends an answer with an amount: it hands over for pricing', async () => {
    const { turn, send, requestHandoff, record } = setup({
      reply: vi.fn(
        async (): Promise<ModelReply> => ({
          ...ANSWER,
          text: 'La Bera SBR 150 cuesta $1.200.',
        })
      ),
    });

    expect(await turn()).toBe('handoff');
    expect(requestHandoff).toHaveBeenCalledWith('c-1', 'pricing');
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith('c-1', HANDOFF_NOTICE);
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: 'handoff',
        reason: 'pricing',
        errorDetail: expect.stringContaining('monto'),
        usage: USAGE,
      })
    );
  });

  it('hands over a message that is not text without asking the model', async () => {
    const chat: ChannelChat = {
      ...CHAT,
      messages: [
        {
          id: 'img-1',
          source: 'customer',
          type: 'image',
          body: null,
          status: null,
        },
      ],
    };
    const { turn, reply, requestHandoff } = setup({ chat });

    expect(await turn('img-1', 'image')).toBe('handoff');
    expect(reply).not.toHaveBeenCalled();
    expect(requestHandoff).toHaveBeenCalledWith('c-1', 'non_text');
  });

  it('ignores a reaction: nothing to answer or hand over', async () => {
    const { turn, reply, requestHandoff, send } = setup();

    expect(await turn('react-1', 'reaction')).toBe('ignored');
    expect(reply).not.toHaveBeenCalled();
    expect(requestHandoff).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it('sends no notice if the chat could not be marked', async () => {
    const { turn, send, requestHandoff } = setup({
      stores: { stores: null, misconfigured: true },
    });
    requestHandoff.mockRejectedValue(new Error('base caída'));

    await expect(turn()).rejects.toThrow('base caída');
    expect(send).not.toHaveBeenCalled();
  });

  it('hands over with error when Saba rejects the assistant key', async () => {
    const { turn, reply, requestHandoff } = setup({
      stores: { stores: null, misconfigured: true },
    });

    expect(await turn()).toBe('handoff');
    expect(reply).not.toHaveBeenCalled();
    expect(requestHandoff).toHaveBeenCalledWith('c-1', 'error');
  });

  it('hands over with error on a refusal, keeping the tokens billed', async () => {
    const { turn, send, record } = setup({
      reply: vi.fn(async (): Promise<ModelReply> => {
        throw new ModelUnavailableError('refusal', 'se negó', {
          model: 'claude-sonnet-5-5',
          usage: USAGE,
        });
      }),
    });

    expect(await turn()).toBe('handoff');
    expect(send).toHaveBeenCalledWith('c-1', HANDOFF_NOTICE);
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: 'handoff',
        reason: 'error',
        errorDetail: 'refusal: se negó',
        usage: USAGE,
      })
    );
  });

  it('marks the chat for a person even if the notice cannot be sent', async () => {
    const send = vi.fn(async (): Promise<{ id: string }> => {
      throw new Error('Meta rechazó el envío');
    });
    const { turn, requestHandoff, record } = setup({ send });

    expect(await turn()).toBe('handoff');
    expect(requestHandoff).toHaveBeenCalledWith('c-1', 'error');
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: 'handoff',
        reason: 'error',
        sentMessageId: null,
        usage: USAGE,
      })
    );
  });

  it('never logs a reply that went out as failed', async () => {
    const record = vi.fn(async (): Promise<void> => {
      throw new Error('base caída');
    });
    const { turn, send } = setup({ record });

    await expect(turn()).rejects.toThrow('base caída');
    expect(send).toHaveBeenCalledTimes(1);
    expect(record).toHaveBeenCalledTimes(1);
  });
});
