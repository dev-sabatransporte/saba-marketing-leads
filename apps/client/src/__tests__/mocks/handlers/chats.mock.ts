import type {
  TChatMessage,
  TConversationSummary,
  TSabaCustomer,
} from '@repo/schemas';
import { HttpResponse, http } from 'msw';
import { BACKEND_URL } from '@/__tests__/mocks/backendUrl';

const HOUR = 60 * 60 * 1000;
const base = `${BACKEND_URL}/v1/whatsapp/conversations`;

/** Windows relative to "now" so open/closed does not depend on the test's day. */
export function conversationsFixture(): TConversationSummary[] {
  const now = Date.now();
  return [
    {
      id: 'conv-open',
      contact: {
        id: 'c1',
        phone: '584141234567',
        whatsAppName: 'Ana Pérez',
        linkedToSaba: true,
      },
      status: 'open',
      unreadCount: 2,
      lastMessageAt: new Date(now - HOUR).toISOString(),
      lastMessagePreview: '¿Tienen la moto en rojo?',
      needsAgent: false,
      assistantEnabled: true,
      windowExpiresAt: new Date(now + 23 * HOUR).toISOString(),
    },
    {
      id: 'conv-closed',
      contact: {
        id: 'c2',
        phone: '584249999999',
        whatsAppName: null,
        linkedToSaba: false,
      },
      status: 'open',
      unreadCount: 0,
      lastMessageAt: new Date(now - 48 * HOUR).toISOString(),
      lastMessagePreview: 'Gracias',
      needsAgent: false,
      assistantEnabled: true,
      windowExpiresAt: new Date(now - 24 * HOUR).toISOString(),
    },
  ];
}

export const messagesFixture: TChatMessage[] = [
  {
    id: 'm1',
    direction: 'inbound',
    source: 'customer',
    type: 'text',
    body: '¿Tienen la moto en rojo?',
    status: null,
    errorDetail: null,
    hasMedia: false,
    waTimestamp: '2026-10-07T15:00:00.000Z',
  },
  {
    id: 'm2',
    direction: 'inbound',
    source: 'customer',
    type: 'image',
    body: null,
    status: null,
    errorDetail: null,
    hasMedia: true,
    waTimestamp: '2026-10-07T15:01:00.000Z',
  },
];

export const sabaCustomerFixture: TSabaCustomer = {
  id: 'p1',
  name: 'Ana María González',
  idNumber: 'V12345678',
  email: 'ana@correo.com',
  phone: '+58 414 1234567',
  city: 'Caracas',
  source: 'web',
  customerSince: '2026-01-15T12:00:00.000Z',
  applications: [
    {
      id: 'a1',
      status: 'date_scheduled',
      statusLabel: 'Cita agendada',
      active: true,
      createdAt: '2026-09-01T12:00:00.000Z',
      product: 'CF 450MT',
      financedAmount: 1500,
      installmentAmount: 40,
      frequency: 'weekly',
    },
  ],
};

export const chatsHandlers = [
  http.get(`${base}/:id/saba-customer`, () =>
    HttpResponse.json({
      success: true,
      data: { noPhone: false, customers: [sabaCustomerFixture] },
    })
  ),
  http.get(base, () =>
    HttpResponse.json({ success: true, data: conversationsFixture() })
  ),
  http.get(`${base}/:id/messages`, () =>
    HttpResponse.json({ success: true, data: messagesFixture })
  ),
  http.post(`${base}/:id/read`, () =>
    HttpResponse.json({ success: true, data: null })
  ),
  http.post(`${base}/:id/typing`, () =>
    HttpResponse.json({ success: true, data: null })
  ),
  http.post(`${base}/:id/messages`, async ({ request }) => {
    const { body } = (await request.json()) as { body: string };
    return HttpResponse.json(
      {
        success: true,
        data: {
          id: 'm3',
          direction: 'outbound',
          source: 'system',
          type: 'text',
          body,
          status: 'sent',
          errorDetail: null,
          hasMedia: false,
          waTimestamp: new Date().toISOString(),
        } satisfies TChatMessage,
      },
      { status: 201 }
    );
  }),
];
