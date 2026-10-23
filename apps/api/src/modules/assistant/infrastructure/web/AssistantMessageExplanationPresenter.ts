import type { TAssistantMessageExplanationResponse } from '@repo/schemas';
import type { MessageExplanation } from '../../domain/AssistantRun';

export function toAssistantMessageExplanationResponse(
  explanation: MessageExplanation
): TAssistantMessageExplanationResponse {
  return {
    success: true,
    data: {
      outcome: explanation.outcome,
      handoffReason:
        explanation.outcome === 'handoff' ? explanation.reason : null,
      toolCalls: explanation.toolCalls.map(({ tool, query, resultCount }) => ({
        tool,
        query,
        resultCount,
      })),
    },
  };
}
