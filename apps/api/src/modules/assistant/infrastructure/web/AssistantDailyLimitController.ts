import { Controller, Get, HttpStatus, Inject } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  assistantDailyLimitResponseSchema,
  type TAssistantDailyLimitResponse,
} from '@repo/schemas';
import { RequirePermissions } from '../../../../shared/decorators/RequirePermissions';
import { ZodApiResponse } from '../../../../shared/decorators/zodSwagger';
import type { GetDailyLimitStatusPort } from '../../application/ports/in/GetDailyLimitStatusPort';
import { ASSISTANT_TOKENS } from '../../tokens';
import { toAssistantDailyLimitResponse } from './AssistantDailyLimitPresenter';

@ApiTags('assistant')
@RequirePermissions({ permissions: ['marketing:access'] })
@Controller('assistant/daily-limit')
export class AssistantDailyLimitController {
  constructor(
    @Inject(ASSISTANT_TOKENS.GetDailyLimitStatus)
    private readonly getDailyLimit: GetDailyLimitStatusPort
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Si el asistente alcanzó el tope diario de respuestas',
    description:
      'Día calendario en hora de Venezuela. Mientras está alcanzado el asistente no responde y los chats nuevos los atiende el equipo; siempre `false` con el asistente apagado.',
  })
  @ZodApiResponse(HttpStatus.OK, assistantDailyLimitResponseSchema)
  async read(): Promise<TAssistantDailyLimitResponse> {
    return toAssistantDailyLimitResponse(await this.getDailyLimit.execute());
  }
}
