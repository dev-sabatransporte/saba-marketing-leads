import Anthropic from '@anthropic-ai/sdk';
import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import type {
  AssistantModelPort,
  ModelReply,
} from '../../application/ports/out/AssistantModelPort';
import { ModelUnavailableError } from '../../domain/AssistantErrors';
import type { ModelTurn } from '../../domain/conversation';
import { MODEL_HANDOFF_REASONS } from '../../domain/handoff';
import { ASSISTANT_TOKENS } from '../../tokens';
import type { AssistantConfig } from '../assistantConfig';

// A WhatsApp reply is short; the cap only stops a runaway answer.
const MAX_TOKENS = 1024;
const TIMEOUT_MS = 30_000;

const TRANSFER_TO_HUMAN = {
  name: 'transfer_to_human',
  description:
    'Pasa la conversación a un asesor de Saba. Úsala en vez de responder cuando el cliente pide hablar con una persona, pregunta por precios, montos o financiamiento, pregunta algo fuera de sedes y horarios, o cuando el dato no está en tus instrucciones.',
  input_schema: {
    type: 'object' as const,
    properties: {
      reason: { type: 'string', enum: [...MODEL_HANDOFF_REASONS] },
    },
    required: ['reason'],
    additionalProperties: false,
  },
  strict: true,
};

const transferInputSchema = z.object({ reason: z.enum(MODEL_HANDOFF_REASONS) });

@Injectable()
export class AnthropicAssistantModel implements AssistantModelPort {
  private readonly client: Anthropic | null;

  constructor(
    @Inject(ASSISTANT_TOKENS.Config)
    private readonly config: Pick<AssistantConfig, 'anthropicApiKey' | 'model'>
  ) {
    this.client = config.anthropicApiKey
      ? new Anthropic({
          apiKey: config.anthropicApiKey,
          timeout: TIMEOUT_MS,
          maxRetries: 1,
          // Resolved on every call, so tests can stub the global fetch.
          fetch: (input, init) => globalThis.fetch(input, init),
        })
      : null;
  }

  async reply({
    instructions,
    turns,
  }: {
    instructions: string;
    turns: ModelTurn[];
  }): Promise<ModelReply> {
    if (!this.client) {
      throw new ModelUnavailableError(
        'not_configured',
        'falta ASSISTANT_ANTHROPIC_API_KEY'
      );
    }

    let response: Anthropic.Beta.BetaMessage;
    try {
      response = await this.client.beta.messages.create({
        model: this.config.model,
        max_tokens: MAX_TOKENS,
        // A refusal is retried on Anthropic's recommended model in the same call.
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        // Stable prefix (tools + rules + stores), cached between turns.
        system: [
          {
            type: 'text',
            text: instructions,
            cache_control: { type: 'ephemeral' },
          },
        ],
        tools: [TRANSFER_TO_HUMAN],
        // Forcing a tool is a 400 on this model family: the model decides.
        tool_choice: { type: 'auto' },
        messages: turns.map((t) => ({ role: t.role, content: t.content })),
        output_config: { effort: 'low' },
      });
    } catch (error: unknown) {
      const detail =
        error instanceof Anthropic.APIError
          ? `Anthropic ${error.status ?? 'sin estado'}: ${error.message}`
          : error instanceof Error
            ? error.message
            : String(error);
      throw new ModelUnavailableError('api_error', detail);
    }

    const billed = {
      model: response.model,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
        cacheWriteTokens: response.usage.cache_creation_input_tokens ?? 0,
      },
    };
    if (response.stop_reason === 'refusal') {
      throw new ModelUnavailableError(
        'refusal',
        'el modelo se negó a responder',
        billed
      );
    }

    const transfer = response.content.find(
      (block) =>
        block.type === 'tool_use' && block.name === TRANSFER_TO_HUMAN.name
    );
    if (transfer?.type === 'tool_use') {
      const input = transferInputSchema.safeParse(transfer.input);
      if (!input.success) {
        throw new ModelUnavailableError(
          'invalid_tool_input',
          'transfer_to_human con un motivo desconocido',
          billed
        );
      }
      return { kind: 'handoff', reason: input.data.reason, ...billed };
    }

    const text = response.content
      .flatMap((block) => (block.type === 'text' ? [block.text] : []))
      .join('')
      .trim();
    if (!text) {
      throw new ModelUnavailableError(
        'empty',
        'el modelo no devolvió texto',
        billed
      );
    }
    return { kind: 'answer', text, ...billed };
  }
}
