import {
  Controller,
  Get,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  assistantMessageExplanationResponseSchema,
  type TAssistantMessageExplanationResponse,
} from '@repo/schemas';
import { RequirePermissions } from '../../../../shared/decorators/RequirePermissions';
import { ZodApiResponse } from '../../../../shared/decorators/zodSwagger';
import type { GetMessageExplanationPort } from '../../application/ports/in/GetMessageExplanationPort';
import { ASSISTANT_TOKENS } from '../../tokens';
import { toAssistantMessageExplanationResponse } from './AssistantMessageExplanationPresenter';

@ApiTags('assistant')
@RequirePermissions({ permissions: ['marketing:access'] })
@Controller('assistant/messages')
export class AssistantMessageExplanationController {
  constructor(
    @Inject(ASSISTANT_TOKENS.GetMessageExplanation)
    private readonly getExplanation: GetMessageExplanationPort
  ) {}

  @Get(':id/explanation')
  @ApiOperation({
    summary: 'El "¿por qué?" de un mensaje del asistente',
    description:
      'Sale de `assistant_runs`: qué buscó, cuántos resultados encontró y, si traspasó, el motivo. Nunca el razonamiento del modelo ni el detalle técnico de un error. 404 si el mensaje no lo envió el asistente o su registro ya se purgó (90 días).',
  })
  @ZodApiResponse(HttpStatus.OK, assistantMessageExplanationResponseSchema)
  async read(
    @Param('id', ParseUUIDPipe) id: string
  ): Promise<TAssistantMessageExplanationResponse> {
    return toAssistantMessageExplanationResponse(
      await this.getExplanation.execute(id)
    );
  }
}
