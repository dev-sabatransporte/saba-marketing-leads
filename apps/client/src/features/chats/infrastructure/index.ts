import { getAPIClient } from '@/lib/api';
import { ChatsServiceClass } from './chats.service';

const api = getAPIClient();
export const ChatsService = new ChatsServiceClass(
  api.v1.whatsapp,
  api.v1.assistant
);
