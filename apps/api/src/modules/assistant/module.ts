import { Module } from '@nestjs/common';
import { StructuredLogger } from '../../infrastructure/logging/StructuredLogger';
import { WhatsAppModule } from '../whatsapp/module';
import { WHATSAPP_TOKENS } from '../whatsapp/tokens';
import { HandleInboundMessageUseCase } from './application/use-cases/HandleInboundMessageUseCase';
import { loadAssistantConfig } from './infrastructure/assistantConfig';
import { AssistantInboundHandler } from './infrastructure/bus/AssistantInboundHandler';
import { AnthropicAssistantModel } from './infrastructure/external/AnthropicAssistantModel';
import { HttpSabaAssistantStores } from './infrastructure/external/HttpSabaAssistantStores';
import { SystemClock } from './infrastructure/external/SystemClock';
import { DrizzleAssistantRunsRepository } from './infrastructure/persistence/DrizzleAssistantRunsRepository';
import { DrizzleAssistantSettingsRepository } from './infrastructure/persistence/DrizzleAssistantSettingsRepository';
import { ASSISTANT_TOKENS } from './tokens';

@Module({
  imports: [WhatsAppModule],
  providers: [
    {
      provide: ASSISTANT_TOKENS.Config,
      useFactory: () => loadAssistantConfig(),
    },
    { provide: ASSISTANT_TOKENS.Clock, useClass: SystemClock },
    { provide: ASSISTANT_TOKENS.Logger, useExisting: StructuredLogger },
    { provide: ASSISTANT_TOKENS.Model, useClass: AnthropicAssistantModel },
    { provide: ASSISTANT_TOKENS.Stores, useClass: HttpSabaAssistantStores },
    {
      provide: ASSISTANT_TOKENS.Channel,
      useExisting: WHATSAPP_TOKENS.AssistantChannel,
    },
    {
      provide: ASSISTANT_TOKENS.Settings,
      useClass: DrizzleAssistantSettingsRepository,
    },
    {
      provide: ASSISTANT_TOKENS.Runs,
      useClass: DrizzleAssistantRunsRepository,
    },
    HandleInboundMessageUseCase,
    {
      provide: ASSISTANT_TOKENS.HandleInboundMessage,
      useExisting: HandleInboundMessageUseCase,
    },
    AssistantInboundHandler,
  ],
})
export class AssistantModule {}
