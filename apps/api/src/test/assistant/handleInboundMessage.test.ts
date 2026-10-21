import { describe, expect, it, vi } from 'vitest';
import type {
  AssistantModelPort,
  ModelReply,
} from '../../modules/assistant/application/ports/out/AssistantModelPort';
import type { ChannelChat } from '../../modules/assistant/application/ports/out/ChatChannelPort';
import type { StoresSnapshot } from '../../modules/assistant/application/ports/out/StoresSourcePort';
import { HandleInboundMessageUseCase } from '../../modules/assistant/application/use-cases/HandleInboundMessageUseCase';
import {
  CatalogUnavailableError,
  ModelUnavailableError,
} from '../../modules/assistant/domain/AssistantErrors';
import type { NewAssistantRun } from '../../modules/assistant/domain/AssistantRun';
import { DEFAULT_ASSISTANT_SETTINGS } from '../../modules/assistant/domain/AssistantSettings';
import {
  HANDOFF_NOTICE,
  handoffNotice,
} from '../../modules/assistant/domain/handoff';
import type { Product } from '../../modules/assistant/domain/product';

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
const BERA: Product = {
  name: 'Moto Bera SBR 150',
  model: 'SBR 150',
  brand: 'Bera',
  categories: ['Motos'],
  inStock: true,
};
const SEARCH: ModelReply = {
  kind: 'search_products',
  callId: 'toolu_1',
  query: 'bera sbr',
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
  search = vi.fn(async (_query: string): Promise<Product[]> => [BERA]),
  send = vi.fn(async (_id: string, _body: string) => ({ id: 'out-1' })),
  record = vi.fn(async (_run: NewAssistantRun): Promise<void> => undefined),
  simpleReplies = true,
}: {
  chat?: ChannelChat;
  /** What the chat looks like once the model has answered. */
  chatWhenSending?: ChannelChat;
  stores?: StoresSnapshot;
  reply?: (
    input: Parameters<AssistantModelPort['reply']>[0]
  ) => Promise<ModelReply>;
  search?: (query: string) => Promise<Product[]>;
  send?: (id: string, body: string) => Promise<{ id: string }>;
  record?: (run: NewAssistantRun) => Promise<void>;
  simpleReplies?: boolean;
} = {}) {
  const requestHandoff = vi.fn(async (): Promise<void> => undefined);
  const useCase = new HandleInboundMessageUseCase(
    {
      get: async () => ({
        ...DEFAULT_ASSISTANT_SETTINGS,
        enabled: true,
        simpleReplies,
      }),
    },
    {
      read: vi.fn(async () => chatWhenSending).mockResolvedValueOnce(chat),
      sendAsAssistant: send,
      requestHandoff,
    },
    { current: async () => stores },
    { search },
    { reply },
    { record },
    { now: () => NOW }
  );
  const turn = (messageId = 'in-2', type = 'text') =>
    useCase.execute({ conversationId: 'c-1', messageId, type });
  return { turn, reply, search, send, record, requestHandoff };
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

  it.each([true, false])(
    'asks the model with the brevity rules only when simple replies is %s',
    async (simpleReplies) => {
      const { turn, reply } = setup({ simpleReplies });

      await turn();
      const [input] = vi.mocked(reply).mock.calls[0] ?? [];
      expect(input?.instructions.includes('en 1 o 2 frases')).toBe(
        simpleReplies
      );
    }
  );

  it('searches Saba when the model asks, and answers with the result', async () => {
    const reply = vi
      .fn<AssistantModelPort['reply']>()
      .mockResolvedValueOnce(SEARCH)
      .mockResolvedValueOnce(ANSWER);
    const { turn, search, send, record } = setup({ reply });

    expect(await turn()).toBe('answered');
    expect(search).toHaveBeenCalledWith('bera sbr');
    expect(reply).toHaveBeenCalledTimes(2);
    expect(reply.mock.calls[1]?.[0].searches).toEqual([
      { callId: 'toolu_1', query: 'bera sbr', products: [BERA] },
    ]);
    expect(send).toHaveBeenCalledWith('c-1', ANSWER_TEXT);
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: 'answered',
        toolCalls: [
          { tool: 'search_products', query: 'bera sbr', resultCount: 1 },
        ],
        // Both calls to the model are billed.
        usage: { ...USAGE, inputTokens: 80, outputTokens: 40 },
      })
    );
  });

  it('hands over with error when Saba does not answer the search', async () => {
    const reply = vi
      .fn<AssistantModelPort['reply']>()
      .mockResolvedValue(SEARCH);
    const { turn, send, requestHandoff, record } = setup({
      reply,
      search: vi.fn(async (): Promise<Product[]> => {
        throw new CatalogUnavailableError(false, 'Saba respondió 429');
      }),
    });

    expect(await turn()).toBe('handoff');
    expect(reply).toHaveBeenCalledTimes(1);
    expect(requestHandoff).toHaveBeenCalledWith('c-1', 'error');
    expect(send).toHaveBeenCalledWith('c-1', HANDOFF_NOTICE);
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: 'handoff',
        reason: 'error',
        errorDetail: expect.stringContaining('Saba respondió 429'),
        toolCalls: [
          { tool: 'search_products', query: 'bera sbr', resultCount: null },
        ],
        usage: USAGE,
      })
    );
  });

  it('hands over with error when the model keeps searching', async () => {
    const reply = vi
      .fn<AssistantModelPort['reply']>()
      .mockResolvedValue(SEARCH);
    const { turn, search, requestHandoff, record } = setup({ reply });

    expect(await turn()).toBe('handoff');
    expect(search).toHaveBeenCalledTimes(3);
    expect(requestHandoff).toHaveBeenCalledWith('c-1', 'error');
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: 'error',
        toolCalls: expect.arrayContaining([
          expect.objectContaining({ tool: 'search_products' }),
        ]),
      })
    );
  });

  it('keeps the tokens of earlier calls when a later one fails', async () => {
    const reply = vi
      .fn<AssistantModelPort['reply']>()
      .mockResolvedValueOnce(SEARCH)
      .mockRejectedValueOnce(new ModelUnavailableError('api_error', 'caído'));
    const { turn, record } = setup({ reply });

    expect(await turn()).toBe('handoff');
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: 'error',
        model: 'claude-sonnet-5-5',
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
