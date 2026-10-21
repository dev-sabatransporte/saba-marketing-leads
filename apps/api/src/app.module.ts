import { Module } from '@nestjs/common';
import { BusModule } from './bus.module';
import { DrizzleModule } from './infrastructure/database/drizzle.module';
import { ErrorsModule } from './infrastructure/errors/ErrorsModule';
import { LoggingModule } from './infrastructure/logging/LoggingModule';
import { AssistantModule } from './modules/assistant/module';
import { AuthModule } from './modules/auth/module';
import { HealthModule } from './modules/health/module';
import { LeadsModule } from './modules/leads/module';
import { WhatsAppModule } from './modules/whatsapp/module';
import { SecurityModule } from './security.module';

@Module({
  imports: [
    LoggingModule,
    ErrorsModule,
    DrizzleModule,
    BusModule,
    SecurityModule,
    AuthModule,
    LeadsModule,
    WhatsAppModule,
    AssistantModule,
    HealthModule,
  ],
  controllers: [],
})
export class AppModule {}
