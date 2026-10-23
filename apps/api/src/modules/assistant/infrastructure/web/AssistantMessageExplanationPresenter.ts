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
      // Field by field: whatever a run stores later stays out unless added here.
      toolCalls: explanation.toolCalls.map(({ tool, query, resultCount }) => ({
        tool,
        query,
        resultCount,
      })),
    },
  };
}
