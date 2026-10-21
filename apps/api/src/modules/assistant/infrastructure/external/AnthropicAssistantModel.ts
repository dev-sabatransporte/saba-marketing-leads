import Anthropic from '@anthropic-ai/sdk';
import { Inject, Injectable } from '@nestjs/common';
import type {
  AssistantModelPort,
  ModelReply,
} from '../../application/ports/out/AssistantModelPort';
import { ModelUnavailableError } from '../../domain/AssistantErrors';
import type { ModelTurn } from '../../domain/conversation';
import { ASSISTANT_TOKENS } from '../../tokens';
import type { AssistantConfig } from '../assistantConfig';

// A WhatsApp reply is short; the cap only stops a runaway answer.
const MAX_TOKENS = 1024;
const TIMEOUT_MS = 30_000;

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

    let response: Anthropic.Message;
    try {
      response = await this.client.messages.create({
        model: this.config.model,
        max_tokens: MAX_TOKENS,
        // Stable prefix (rules + stores), cached between turns.
        system: [
          {
            type: 'text',
            text: instructions,
            cache_control: { type: 'ephemeral' },
          },
        ],
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

    if (response.stop_reason === 'refusal') {
      throw new ModelUnavailableError(
        'refusal',
        'el modelo se negó a responder'
      );
    }
    const text = response.content
      .flatMap((block) => (block.type === 'text' ? [block.text] : []))
      .join('')
      .trim();
    if (!text) {
      throw new ModelUnavailableError('empty', 'el modelo no devolvió texto');
    }

    return {
      text,
      model: response.model,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
        cacheWriteTokens: response.usage.cache_creation_input_tokens ?? 0,
      },
    };
  }
}
