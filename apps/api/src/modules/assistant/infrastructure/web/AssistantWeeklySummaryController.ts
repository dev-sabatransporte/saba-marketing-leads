import { Controller, Get, HttpStatus, Inject } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  assistantWeeklySummaryResponseSchema,
  type TAssistantWeeklySummaryResponse,
} from '@repo/schemas';
import { RequirePermissions } from '../../../../shared/decorators/RequirePermissions';
import { ZodApiResponse } from '../../../../shared/decorators/zodSwagger';
import type { GetWeeklySummaryPort } from '../../application/ports/in/GetWeeklySummaryPort';
import { ASSISTANT_TOKENS } from '../../tokens';
import { toAssistantWeeklySummaryResponse } from './AssistantWeeklySummaryPresenter';

@ApiTags('assistant')
@RequirePermissions({ permissions: ['assistant:manage'] })
@Controller('assistant/weekly-summary')
export class AssistantWeeklySummaryController {
  constructor(
    @Inject(ASSISTANT_TOKENS.GetWeeklySummary)
    private readonly getSummary: GetWeeklySummaryPort
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Cómo le fue al asistente en los últimos 7 días',
    description:
      'Conversaciones atendidas (donde envió una respuesta o un aviso de traspaso), cuántas resolvió sin que interviniera una persona, traspasos por motivo y el costo estimado a partir de los tokens. Un modelo sin tarifa conocida queda fuera del costo y se nombra en `unpricedModels`.',
  })
  @ZodApiResponse(HttpStatus.OK, assistantWeeklySummaryResponseSchema)
  async read(): Promise<TAssistantWeeklySummaryResponse> {
    return toAssistantWeeklySummaryResponse(await this.getSummary.execute());
  }
}
