import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Inject,
  Patch,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  assistantSettingsResponseSchema,
  type TAssistantSettingsResponse,
  updateAssistantSettingsSchema,
} from '@repo/schemas';
import { RequirePermissions } from '../../../../shared/decorators/RequirePermissions';
import {
  ZodApiBody,
  ZodApiResponse,
} from '../../../../shared/decorators/zodSwagger';
import { createZodDto } from '../../../../shared/utils/createZodDto';
import type { AuthenticatedUser } from '../../../auth/domain/AuthSession';
import { CurrentUser } from '../../../auth/infrastructure/web/CurrentUser';
import type {
  GetAssistantSettingsPort,
  UpdateAssistantSettingsPort,
} from '../../application/ports/in/AssistantSettingsPort';
import { ASSISTANT_TOKENS } from '../../tokens';
import { toAssistantSettingsResponse } from './AssistantSettingsPresenter';

class UpdateAssistantSettingsDto extends createZodDto(
  updateAssistantSettingsSchema
) {}

@ApiTags('assistant')
@RequirePermissions({ permissions: ['assistant:manage'] })
@Controller('assistant/settings')
export class AssistantSettingsController {
  constructor(
    @Inject(ASSISTANT_TOKENS.GetSettings)
    private readonly getSettings: GetAssistantSettingsPort,
    @Inject(ASSISTANT_TOKENS.UpdateSettings)
    private readonly updateSettings: UpdateAssistantSettingsPort
  ) {}

  @Get()
  @ApiOperation({
    summary:
      'Interruptor y límites del asistente, con quién y cuándo cambió cada uno',
  })
  @ZodApiResponse(HttpStatus.OK, assistantSettingsResponseSchema)
  async read(): Promise<TAssistantSettingsResponse> {
    return toAssistantSettingsResponse(await this.getSettings.execute());
  }

  @Patch()
  @ApiOperation({
    summary: 'Cambia ajustes del asistente',
    description:
      'Solo los ajustes enviados. Aplica desde el siguiente turno, sin reiniciar. Un valor igual al guardado no cuenta como cambio.',
  })
  @ZodApiBody(updateAssistantSettingsSchema)
  @ZodApiResponse(HttpStatus.OK, assistantSettingsResponseSchema)
  async update(
    @Body() body: UpdateAssistantSettingsDto,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<TAssistantSettingsResponse> {
    return toAssistantSettingsResponse(
      await this.updateSettings.execute({
        patch: body,
        changedBy: { id: user.id, name: user.name },
      })
    );
  }
}
