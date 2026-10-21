import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  chatSabaCustomersResponseSchema,
  conversationsResponseSchema,
  emptyResponseSchema,
  messageResponseSchema,
  messagesResponseSchema,
  sendMessageSchema,
  type TChatSabaCustomersResponse,
  type TConversationsResponse,
  type TEmptyResponse,
  type TMessageResponse,
  type TMessagesResponse,
} from '@repo/schemas';
import type { Request } from 'express';
import { RequirePermissions } from '../../../../shared/decorators/RequirePermissions';
import {
  ZodApiBody,
  ZodApiResponse,
} from '../../../../shared/decorators/zodSwagger';
import { extractBearerToken } from '../../../../shared/http/extractBearerToken';
import { createZodDto } from '../../../../shared/utils/createZodDto';
import type { AuthenticatedUser } from '../../../auth/domain/AuthSession';
import { InvalidSessionException } from '../../../auth/domain/exceptions/InvalidSessionException';
import { CurrentUser } from '../../../auth/infrastructure/web/CurrentUser';
import type { ConversationActionsPort } from '../../application/ports/in/ConversationActionsPort';
import type { GetSabaCustomerPort } from '../../application/ports/in/GetSabaCustomerPort';
import type { ListConversationsPort } from '../../application/ports/in/ListConversationsPort';
import type { ListMessagesPort } from '../../application/ports/in/ListMessagesPort';
import type { MarkAsReadPort } from '../../application/ports/in/MarkAsReadPort';
import type { ReplyToConversationPort } from '../../application/ports/in/ReplyToConversationPort';
import type { SendTypingIndicatorPort } from '../../application/ports/in/SendTypingIndicatorPort';
import { WHATSAPP_TOKENS } from '../../tokens';
import {
  toChatSabaCustomersResponse,
  toConversationsResponse,
  toMessageResponse,
  toMessagesResponse,
} from './ChatsPresenter';

class SendMessageDto extends createZodDto(sendMessageSchema) {}

// For now `marketing:access` covers the whole inbox; fine-grained permissions
// (`whatsapp_chats.*`) are pending in the plan.
@ApiTags('whatsapp')
@RequirePermissions({ permissions: ['marketing:access'] })
@Controller('whatsapp/conversations')
export class ChatsController {
  constructor(
    @Inject(WHATSAPP_TOKENS.ListConversations)
    private readonly listConversations: ListConversationsPort,
    @Inject(WHATSAPP_TOKENS.ListMessages)
    private readonly listMessages: ListMessagesPort,
    @Inject(WHATSAPP_TOKENS.ReplyToConversation)
    private readonly reply: ReplyToConversationPort,
    @Inject(WHATSAPP_TOKENS.MarkAsRead)
    private readonly markAsRead: MarkAsReadPort,
    @Inject(WHATSAPP_TOKENS.ConversationActions)
    private readonly actions: ConversationActionsPort,
    @Inject(WHATSAPP_TOKENS.SendTypingIndicator)
    private readonly sendTypingIndicator: SendTypingIndicatorPort,
    @Inject(WHATSAPP_TOKENS.GetSabaCustomer)
    private readonly getSabaCustomer: GetSabaCustomerPort
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Conversaciones, la de actividad más reciente primero',
  })
  @ZodApiResponse(HttpStatus.OK, conversationsResponseSchema)
  async list(): Promise<TConversationsResponse> {
    return toConversationsResponse(await this.listConversations.execute());
  }

  @Get(':id/messages')
  @ApiOperation({
    summary: 'Mensajes de una conversación, en orden cronológico',
  })
  @ZodApiResponse(HttpStatus.OK, messagesResponseSchema)
  async messages(
    @Param('id', ParseUUIDPipe) id: string
  ): Promise<TMessagesResponse> {
    return toMessagesResponse(await this.listMessages.execute(id));
  }

  @Post(':id/messages')
  @ApiOperation({
    summary: 'Responde con texto libre (solo con la ventana de 24 h abierta)',
  })
  @ZodApiBody(sendMessageSchema)
  @ZodApiResponse(HttpStatus.CREATED, messageResponseSchema)
  async send(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: SendMessageDto,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<TMessageResponse> {
    return toMessageResponse(
      await this.reply.execute({
        conversationId: id,
        body: body.body,
        sentBy: user.id,
      })
    );
  }

  @Post(':id/read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Marca la conversación como leída' })
  @ZodApiResponse(HttpStatus.OK, emptyResponseSchema)
  async read(@Param('id', ParseUUIDPipe) id: string): Promise<TEmptyResponse> {
    await this.markAsRead.execute(id);
    return { success: true, data: null };
  }

  @Post(':id/assistant/pause')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Pausa el asistente en esta conversación hasta que se resuelva',
  })
  @ZodApiResponse(HttpStatus.OK, emptyResponseSchema)
  async pauseAssistant(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<TEmptyResponse> {
    await this.actions.pauseAssistant(id, user.id);
    return { success: true, data: null };
  }

  @Post(':id/resolve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Marca la conversación como resuelta',
    description:
      'Quita la pausa del asistente y la marca "Necesita asesor": cuando el cliente vuelva a escribir, el asistente responde de nuevo.',
  })
  @ZodApiResponse(HttpStatus.OK, emptyResponseSchema)
  async resolve(
    @Param('id', ParseUUIDPipe) id: string
  ): Promise<TEmptyResponse> {
    await this.actions.resolve(id);
    return { success: true, data: null };
  }

  @Post(':id/typing')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Muestra "escribiendo…" al cliente y marca leído su último mensaje',
    description:
      'Best effort: con la ventana cerrada, sin mensajes del cliente o si Meta lo rechaza, responde igual 200 sin hacer nada.',
  })
  @ZodApiResponse(HttpStatus.OK, emptyResponseSchema)
  async typing(
    @Param('id', ParseUUIDPipe) id: string
  ): Promise<TEmptyResponse> {
    await this.sendTypingIndicator.execute(id);
    return { success: true, data: null };
  }

  @Get(':id/saba-customer')
  @ApiOperation({
    summary:
      'Clientes de Saba con el teléfono del chat (identidad y solicitudes)',
    description:
      'Se consulta al servidor de Saba con la sesión del agente; Saba vuelve a validar su acceso a marketing.',
  })
  @ZodApiResponse(HttpStatus.OK, chatSabaCustomersResponseSchema)
  async sabaCustomer(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request
  ): Promise<TChatSabaCustomersResponse> {
    const credential = extractBearerToken(req);
    if (!credential) throw new InvalidSessionException();
    return toChatSabaCustomersResponse(
      await this.getSabaCustomer.execute(id, credential)
    );
  }
}
