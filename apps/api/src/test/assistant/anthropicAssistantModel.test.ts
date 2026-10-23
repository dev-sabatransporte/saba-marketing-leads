import { afterEach, describe, expect, it, vi } from 'vitest';
import { ModelUnavailableError } from '../../modules/assistant/domain/AssistantErrors';
import { AnthropicAssistantModel } from '../../modules/assistant/infrastructure/external/AnthropicAssistantModel';

const CONFIG = { anthropicApiKey: 'sk-test', model: 'claude-sonnet-5-5' };
const INPUT = {
  instructions: 'Eres el asistente virtual de Saba.',
  turns: [{ role: 'user' as const, content: '¿Dónde queda Catia?' }],
  searches: [],
  simpleReplies: false,
};

function message(overrides: Record<string, unknown> = {}): Response {
  return new Response(
    JSON.stringify({
      id: 'msg_1',
      type: 'message',
      role: 'assistant',
      model: 'claude-sonnet-5-5',
      content: [{ type: 'text', text: 'Queda en la Av. Sucre.' }],
      stop_reason: 'end_turn',
      stop_sequence: null,
      usage: {
        input_tokens: 30,
        output_tokens: 12,
        cache_read_input_tokens: 800,
        cache_creation_input_tokens: 0,
      },
      ...overrides,
    }),
    { status: 200, headers: { 'content-type': 'application/json' } }
  );
}

function stubFetch(response: Response) {
  const fetchMock = vi.fn(async () => response);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

async function sentRequest(fetchMock: ReturnType<typeof stubFetch>) {
  const [url, init] = fetchMock.mock.calls[0] as unknown as [
    string,
    RequestInit,
  ];
  return {
    url: String(url),
    headers: new Headers(init.headers),
    body: JSON.parse(String(init.body)) as Record<string, unknown>,
  };
}

describe('AnthropicAssistantModel', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('asks with its own key, low effort and the instructions cached', async () => {
    const fetchMock = stubFetch(message());

    await new AnthropicAssistantModel(CONFIG).reply(INPUT);

    const { url, headers, body } = await sentRequest(fetchMock);
    expect(url).toContain('https://api.anthropic.com/v1/messages');
    expect(headers.get('x-api-key')).toBe('sk-test');
    expect(headers.get('anthropic-beta')).toContain(
      'server-side-fallback-2026-07-01'
    );
    expect(body).toMatchObject({
      model: 'claude-sonnet-5-5',
      system: [
        {
          type: 'text',
          text: 'Eres el asistente virtual de Saba.',
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [{ role: 'user', content: '¿Dónde queda Catia?' }],
      output_config: { effort: 'low' },
      fallbacks: 'default',
      tool_choice: { type: 'auto', disable_parallel_tool_use: true },
      tools: [
        expect.objectContaining({
          name: 'search_products',
          strict: true,
          input_schema: expect.objectContaining({
            required: ['query'],
          }),
        }),
        expect.objectContaining({
          name: 'transfer_to_human',
          strict: true,
          input_schema: expect.objectContaining({
            required: ['reason'],
          }),
        }),
        expect.objectContaining({
          name: 'greeting_only',
          strict: true,
          input_schema: expect.objectContaining({ properties: {} }),
        }),
        expect.objectContaining({
          name: 'closing',
          strict: true,
          input_schema: expect.objectContaining({ properties: {} }),
        }),
      ],
    });
  });

  it.each([
    [true, 300],
    [false, 1024],
  ])(
    'with simple replies %s caps the output at %i tokens',
    async (simpleReplies, maxTokens) => {
      const fetchMock = stubFetch(message());

      await new AnthropicAssistantModel(CONFIG).reply({
        ...INPUT,
        simpleReplies,
      });

      const { body } = await sentRequest(fetchMock);
      expect(body.max_tokens).toBe(maxTokens);
    }
  );

  it('fails when the reply hits the output cap, keeping what it billed', async () => {
    stubFetch(
      message({
        stop_reason: 'max_tokens',
        content: [{ type: 'text', text: 'La sede de Catia abre de lunes' }],
      })
    );

    const error = await new AnthropicAssistantModel(CONFIG)
      .reply(INPUT)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ModelUnavailableError);
    expect(error).toMatchObject({
      reason: 'truncated',
      billed: { model: 'claude-sonnet-5-5', usage: { outputTokens: 12 } },
    });
  });

  it('asks for a product search when the model calls search_products', async () => {
    stubFetch(
      message({
        stop_reason: 'tool_use',
        content: [
          { type: 'text', text: 'Déjame revisar' },
          {
            type: 'tool_use',
            id: 'toolu_1',
            name: 'search_products',
            input: { query: 'bera sbr' },
          },
        ],
      })
    );

    expect(
      await new AnthropicAssistantModel(CONFIG).reply(INPUT)
    ).toMatchObject({
      kind: 'search_products',
      callId: 'toolu_1',
      query: 'bera sbr',
      model: 'claude-sonnet-5-5',
    });
  });

  it('sends back each search as the tool call and its result', async () => {
    const fetchMock = stubFetch(message());

    await new AnthropicAssistantModel(CONFIG).reply({
      ...INPUT,
      searches: [
        {
          callId: 'toolu_1',
          query: 'bera sbr',
          products: [
            {
              name: 'Moto Bera SBR 150',
              model: 'SBR 150',
              brand: 'Bera',
              categories: ['Motos'],
              inStock: false,
            },
          ],
        },
      ],
    });

    const { body } = await sentRequest(fetchMock);
    const messages = body.messages as Array<{
      role: string;
      content: Array<Record<string, unknown>>;
    }>;
    expect(messages).toHaveLength(3);
    expect(messages[1]).toEqual({
      role: 'assistant',
      content: [
        {
          type: 'tool_use',
          id: 'toolu_1',
          name: 'search_products',
          input: { query: 'bera sbr' },
        },
      ],
    });
    expect(messages[2]?.role).toBe('user');
    expect(messages[2]?.content[0]).toMatchObject({
      type: 'tool_result',
      tool_use_id: 'toolu_1',
    });
    expect(JSON.parse(String(messages[2]?.content[0]?.content))).toEqual({
      products: [
        {
          name: 'Moto Bera SBR 150',
          model: 'SBR 150',
          brand: 'Bera',
          categories: ['Motos'],
          in_stock: false,
        },
      ],
    });
  });

  it('treats a search without text as an unusable reply', async () => {
    stubFetch(
      message({
        stop_reason: 'tool_use',
        content: [
          {
            type: 'tool_use',
            id: 'toolu_1',
            name: 'search_products',
            input: { query: '  ' },
          },
        ],
      })
    );

    await expect(
      new AnthropicAssistantModel(CONFIG).reply(INPUT)
    ).rejects.toMatchObject({ reason: 'invalid_tool_input' });
  });

  it('hands over when the model calls transfer_to_human', async () => {
    stubFetch(
      message({
        stop_reason: 'tool_use',
        content: [
          { type: 'text', text: 'Un momento' },
          {
            type: 'tool_use',
            id: 'toolu_1',
            name: 'transfer_to_human',
            input: { reason: 'customer_requested' },
          },
        ],
      })
    );

    expect(
      await new AnthropicAssistantModel(CONFIG).reply(INPUT)
    ).toMatchObject({
      kind: 'handoff',
      reason: 'customer_requested',
      model: 'claude-sonnet-5-5',
    });
  });

  it('a transfer for pricing is the fixed prices text, not a handoff', async () => {
    stubFetch(
      message({
        stop_reason: 'tool_use',
        content: [
          {
            type: 'tool_use',
            id: 'toolu_1',
            name: 'transfer_to_human',
            input: { reason: 'pricing' },
          },
        ],
      })
    );

    expect(
      await new AnthropicAssistantModel(CONFIG).reply(INPUT)
    ).toMatchObject({ kind: 'fixed', reply: 'pricing' });
  });

  it.each([
    ['greeting_only', 'greeting'],
    ['closing', 'closing'],
  ] as const)(
    '%s asks for the fixed %s text, ignoring any text the model wrote',
    async (tool, fixed) => {
      stubFetch(
        message({
          stop_reason: 'tool_use',
          content: [
            { type: 'text', text: '¡Hola! ¿Cómo estás?' },
            { type: 'tool_use', id: 'toolu_1', name: tool, input: {} },
          ],
        })
      );

      expect(
        await new AnthropicAssistantModel(CONFIG).reply(INPUT)
      ).toMatchObject({ kind: 'fixed', reply: fixed });
    }
  );

  it('treats an unknown handoff reason as an unusable reply', async () => {
    stubFetch(
      message({
        stop_reason: 'tool_use',
        content: [
          {
            type: 'tool_use',
            id: 'toolu_1',
            name: 'transfer_to_human',
            input: { reason: 'error' },
          },
        ],
      })
    );

    await expect(
      new AnthropicAssistantModel(CONFIG).reply(INPUT)
    ).rejects.toMatchObject({ reason: 'invalid_tool_input' });
  });

  it('returns the text, the model and the tokens', async () => {
    stubFetch(message());

    expect(await new AnthropicAssistantModel(CONFIG).reply(INPUT)).toEqual({
      kind: 'answer',
      text: 'Queda en la Av. Sucre.',
      model: 'claude-sonnet-5-5',
      usage: {
        inputTokens: 30,
        outputTokens: 12,
        cacheReadTokens: 800,
        cacheWriteTokens: 0,
      },
    });
  });

  it('fails on a refusal or an empty reply', async () => {
    stubFetch(message({ stop_reason: 'refusal', content: [] }));
    await expect(
      new AnthropicAssistantModel(CONFIG).reply(INPUT)
    ).rejects.toMatchObject({ reason: 'refusal' });

    stubFetch(message({ content: [{ type: 'text', text: '  ' }] }));
    await expect(
      new AnthropicAssistantModel(CONFIG).reply(INPUT)
    ).rejects.toMatchObject({ reason: 'empty' });
  });

  it('fails on an API error without leaking it as something else', async () => {
    stubFetch(
      new Response(
        JSON.stringify({
          type: 'error',
          error: { type: 'authentication_error', message: 'invalid x-api-key' },
        }),
        { status: 401, headers: { 'content-type': 'application/json' } }
      )
    );

    await expect(
      new AnthropicAssistantModel(CONFIG).reply(INPUT)
    ).rejects.toMatchObject({ reason: 'api_error' });
  });

  it('does not call Anthropic without its key', async () => {
    const fetchMock = stubFetch(message());

    const error = await new AnthropicAssistantModel({
      ...CONFIG,
      anthropicApiKey: null,
    })
      .reply(INPUT)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ModelUnavailableError);
    expect(error).toMatchObject({ reason: 'not_configured' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
