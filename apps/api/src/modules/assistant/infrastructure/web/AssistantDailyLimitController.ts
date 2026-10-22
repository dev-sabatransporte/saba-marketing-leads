import { Controller, Get, HttpStatus, Inject } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  assistantDailyLimitResponseSchema,
  type TAssistantDailyLimitResponse,
} from '@repo/schemas';
import { RequirePermissions } from '../../../../shared/decorators/RequirePermissions';
import { ZodApiResponse } from '../../../../shared/decorators/zodSwagger';
import type { DailyLimitStatusPort } from '../../application/ports/in/DailyLimitStatusPort';
import { ASSISTANT_TOKENS } from '../../tokens';

@ApiTags('assistant')
@RequirePermissions({ permissions: ['marketing:access'] })
@Controller('assistant/daily-limit')
export class AssistantDailyLimitController {
  constructor(
    @Inject(ASSISTANT_TOKENS.DailyLimitStatus)
    private readonly dailyLimit: DailyLimitStatusPort
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Si el asistente alcanzó el tope diario de respuestas',
    description:
      'Día calendario en hora de Venezuela. Mientras está alcanzado el asistente no responde y los chats nuevos los atiende el equipo; siempre `false` con el asistente apagado.',
  })
  @ZodApiResponse(HttpStatus.OK, assistantDailyLimitResponseSchema)
  async read(): Promise<TAssistantDailyLimitResponse> {
    return { success: true, data: await this.dailyLimit.execute() };
  }
}
