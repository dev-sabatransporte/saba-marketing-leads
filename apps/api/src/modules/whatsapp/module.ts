import { Module } from '@nestjs/common';
import { SabaCustomersModule } from '../sabaCustomers/module';
import { SABA_CUSTOMERS_TOKENS } from '../sabaCustomers/tokens';
import { GetMediaUseCase } from './application/use-cases/GetMediaUseCase';
import { GetSabaCustomerUseCase } from './application/use-cases/GetSabaCustomerUseCase';
import { ListConversationsUseCase } from './application/use-cases/ListConversationsUseCase';
import { ListMessagesUseCase } from './application/use-cases/ListMessagesUseCase';
import { MarkAsReadUseCase } from './application/use-cases/MarkAsReadUseCase';
import { ProcessWebhookEventUseCase } from './application/use-cases/ProcessWebhookEventUseCase';
import { ReceiveWebhookUseCase } from './application/use-cases/ReceiveWebhookUseCase';
import { ReplyToConversationUseCase } from './application/use-cases/ReplyToConversationUseCase';
import { ReprocessPendingUseCase } from './application/use-cases/ReprocessPendingUseCase';
import { SendTypingIndicatorUseCase } from './application/use-cases/SendTypingIndicatorUseCase';
import { VerifyWebhookSubscriptionUseCase } from './application/use-cases/VerifyWebhookSubscriptionUseCase';
import { CqrsInboundMessagePublisher } from './infrastructure/bus/CqrsInboundMessagePublisher';
import { CqrsWebhookEventPublisher } from './infrastructure/bus/CqrsWebhookEventPublisher';
import { ProcessWebhookEventHandler } from './infrastructure/bus/ProcessWebhookEventHandler';
import { WebhookReprocessorService } from './infrastructure/bus/WebhookReprocessorService';
import { GraphWhatsAppCloudAdapter } from './infrastructure/external/GraphWhatsAppCloudAdapter';
import { HmacWebhookSignatureVerifier } from './infrastructure/external/HmacWebhookSignatureVerifier';
import { SystemClock } from './infrastructure/external/SystemClock';
import { DrizzleChatsRepository } from './infrastructure/persistence/DrizzleChatsRepository';
import { DrizzleInboxUnitOfWork } from './infrastructure/persistence/DrizzleInboxUnitOfWork';
import { DrizzleWebhookEventRepository } from './infrastructure/persistence/DrizzleWebhookEventRepository';
import { ChatsController } from './infrastructure/web/ChatsController';
import { MediaController } from './infrastructure/web/MediaController';
import { WhatsAppWebhookController } from './infrastructure/web/WhatsAppWebhookController';
import { loadWhatsAppConfig } from './infrastructure/whatsappConfig';
import { WHATSAPP_TOKENS } from './tokens';

@Module({
  imports: [SabaCustomersModule],
  controllers: [WhatsAppWebhookController, ChatsController, MediaController],
  providers: [
    { provide: WHATSAPP_TOKENS.Config, useFactory: () => loadWhatsAppConfig() },
    {
      provide: WHATSAPP_TOKENS.WebhookSettings,
      useExisting: WHATSAPP_TOKENS.Config,
    },
    {
      provide: WHATSAPP_TOKENS.WebhookSignatureVerifier,
      useClass: HmacWebhookSignatureVerifier,
    },
    {
      provide: WHATSAPP_TOKENS.WebhookEventRepository,
      useClass: DrizzleWebhookEventRepository,
    },
    {
      provide: WHATSAPP_TOKENS.WebhookEventPublisher,
      useClass: CqrsWebhookEventPublisher,
    },
    {
      provide: WHATSAPP_TOKENS.InboundMessagePublisher,
      useClass: CqrsInboundMessagePublisher,
    },
    VerifyWebhookSubscriptionUseCase,
    {
      provide: WHATSAPP_TOKENS.VerifyWebhookSubscription,
      useExisting: VerifyWebhookSubscriptionUseCase,
    },
    ReceiveWebhookUseCase,
    {
      provide: WHATSAPP_TOKENS.ReceiveWebhook,
      useExisting: ReceiveWebhookUseCase,
    },
    {
      provide: WHATSAPP_TOKENS.InboxUnitOfWork,
      useClass: DrizzleInboxUnitOfWork,
    },
    {
      provide: WHATSAPP_TOKENS.SabaCustomers,
      useExisting: SABA_CUSTOMERS_TOKENS.Reader,
    },
    GetSabaCustomerUseCase,
    {
      provide: WHATSAPP_TOKENS.GetSabaCustomer,
      useExisting: GetSabaCustomerUseCase,
    },
    ProcessWebhookEventUseCase,
    {
      provide: WHATSAPP_TOKENS.ProcessWebhookEvent,
      useExisting: ProcessWebhookEventUseCase,
    },
    ReprocessPendingUseCase,
    {
      provide: WHATSAPP_TOKENS.ReprocessPending,
      useExisting: ReprocessPendingUseCase,
    },
    ProcessWebhookEventHandler,
    {
      provide: WHATSAPP_TOKENS.ChatsRepository,
      useClass: DrizzleChatsRepository,
    },
    {
      provide: WHATSAPP_TOKENS.WhatsAppCloud,
      useClass: GraphWhatsAppCloudAdapter,
    },
    { provide: WHATSAPP_TOKENS.Clock, useClass: SystemClock },
    ListConversationsUseCase,
    {
      provide: WHATSAPP_TOKENS.ListConversations,
      useExisting: ListConversationsUseCase,
    },
    ListMessagesUseCase,
    {
      provide: WHATSAPP_TOKENS.ListMessages,
      useExisting: ListMessagesUseCase,
    },
    ReplyToConversationUseCase,
    {
      provide: WHATSAPP_TOKENS.ReplyToConversation,
      useExisting: ReplyToConversationUseCase,
    },
    GetMediaUseCase,
    { provide: WHATSAPP_TOKENS.GetMedia, useExisting: GetMediaUseCase },
    MarkAsReadUseCase,
    { provide: WHATSAPP_TOKENS.MarkAsRead, useExisting: MarkAsReadUseCase },
    SendTypingIndicatorUseCase,
    {
      provide: WHATSAPP_TOKENS.SendTypingIndicator,
      useExisting: SendTypingIndicatorUseCase,
    },
    WebhookReprocessorService,
  ],
})
export class WhatsAppModule {}
