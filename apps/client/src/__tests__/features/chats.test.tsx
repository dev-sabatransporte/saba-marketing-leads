import { HttpResponse, http } from 'msw';
import React from 'react';
import { BACKEND_URL } from '@/__tests__/mocks/backendUrl';
import {
  conversationsFixture,
  sabaCustomerFixture,
} from '@/__tests__/mocks/handlers/chats.mock';
import { ChatsPage } from '@/features/chats/ui/pages/ChatsPage';
import { server } from '../mocks/server';
import {
  fireEvent,
  render,
  screen,
  userEvent,
  waitFor,
  within,
} from '../test-utils/test-utils';

const base = `${BACKEND_URL}/v1/whatsapp/conversations`;

describe('ChatsPage', () => {
  it('lists the conversations with their preview and unread count', async () => {
    render(<ChatsPage />);

    const list = await screen.findByRole('navigation', {
      name: 'Conversaciones',
    });
    expect(within(list).getByText('Ana Pérez')).toBeInTheDocument();
    expect(
      within(list).getByText('¿Tienen la moto en rojo?')
    ).toBeInTheDocument();
    expect(within(list).getByLabelText('2 sin leer')).toBeInTheDocument();
    // Without a WhatsApp name the phone is shown.
    expect(within(list).getByText('+58 424 999 9999')).toBeInTheDocument();
  });

  it('marks the chats the assistant handed over as needing an agent', async () => {
    server.use(
      http.get(base, () =>
        HttpResponse.json({
          success: true,
          // The API already sends them first.
          data: conversationsFixture()
            .reverse()
            .map((c) => ({
              ...c,
              needsAgent: c.id === 'conv-closed',
            })),
        })
      )
    );
    render(<ChatsPage />);

    const list = await screen.findByRole('navigation', {
      name: 'Conversaciones',
    });
    const [needsAgent, other] = within(list).getAllByRole('button');
    expect(
      within(needsAgent as HTMLElement).getByText('Necesita asesor')
    ).toBeInTheDocument();
    expect(
      within(other as HTMLElement).queryByText('Necesita asesor')
    ).not.toBeInTheDocument();
  });

  it('opens the thread, shows the customer image and marks it as read', async () => {
    let marked: string | undefined;
    server.use(
      http.post(`${base}/:id/read`, ({ params }) => {
        marked = String(params.id);
        return HttpResponse.json({ success: true, data: null });
      })
    );
    const user = userEvent.setup();
    render(<ChatsPage />);

    await user.click(await screen.findByRole('button', { name: /Ana Pérez/ }));

    const thread = await screen.findByRole('list', { name: 'Mensajes' });
    expect(
      within(thread).getByText('¿Tienen la moto en rojo?')
    ).toBeInTheDocument();
    expect(
      within(thread).getByRole('img', { name: 'Imagen del cliente' })
    ).toHaveAttribute('src', '/api/backend/v1/whatsapp/messages/m2/media');
    expect(
      screen.getByText(/Ventana de respuesta: quedan/)
    ).toBeInTheDocument();
    await waitFor(() => expect(marked).toBe('conv-open'));
  });

  it('shows a loader while the image downloads and removes it when done', async () => {
    const user = userEvent.setup();
    render(<ChatsPage />);
    await user.click(await screen.findByRole('button', { name: /Ana Pérez/ }));

    const image = await screen.findByRole('img', {
      name: 'Imagen del cliente',
    });
    expect(screen.getByRole('status')).toHaveTextContent('Cargando imagen…');

    fireEvent.load(image);

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('falls back to the notice if Meta no longer has the image', async () => {
    const user = userEvent.setup();
    render(<ChatsPage />);
    await user.click(await screen.findByRole('button', { name: /Ana Pérez/ }));

    fireEvent.error(
      await screen.findByRole('img', { name: 'Imagen del cliente' })
    );

    expect(
      await screen.findByText(
        '📷 Imagen — ver en el celular (ya no está en WhatsApp)'
      )
    ).toBeInTheDocument();
  });

  it('opens the photos in a viewer on the same page and browses them with arrows', async () => {
    const photo = (id: string, body: string | null) => ({
      id,
      direction: 'inbound' as const,
      source: 'customer' as const,
      type: 'image',
      body,
      status: null,
      errorDetail: null,
      hasMedia: true,
      waTimestamp: '2026-10-07T15:00:00.000Z',
    });
    server.use(
      http.get(`${base}/:id/messages`, () =>
        HttpResponse.json({
          success: true,
          data: [
            photo('f1', 'la moto por delante'),
            photo('f2', 'y por detrás'),
          ],
        })
      )
    );
    const user = userEvent.setup();
    render(<ChatsPage />);
    await user.click(await screen.findByRole('button', { name: /Ana Pérez/ }));

    const [first] = await screen.findAllByRole('button', {
      name: 'Ver imagen en grande',
    });
    if (!first) throw new Error('sin fotos');
    await user.click(first);

    const viewer = await screen.findByRole('dialog', { name: 'Imagen 1 de 2' });
    expect(
      within(viewer).getByRole('img', { name: 'la moto por delante' })
    ).toHaveAttribute('src', '/api/backend/v1/whatsapp/messages/f1/media');
    expect(
      within(viewer).queryByRole('button', { name: 'Imagen anterior' })
    ).not.toBeInTheDocument();

    await user.click(
      within(viewer).getByRole('button', { name: 'Imagen siguiente' })
    );
    expect(
      await screen.findByRole('dialog', { name: 'Imagen 2 de 2' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: 'y por detrás' })
    ).toBeInTheDocument();

    await user.keyboard('{ArrowLeft}');
    expect(
      await screen.findByRole('dialog', { name: 'Imagen 1 de 2' })
    ).toBeInTheDocument();

    await user.keyboard('{Escape}');
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    );
  });

  it('labels the messages the assistant sent', async () => {
    server.use(
      http.get(`${base}/:id/messages`, () =>
        HttpResponse.json({
          success: true,
          data: [
            {
              id: 'a1',
              direction: 'outbound',
              source: 'assistant',
              type: 'text',
              body: 'Hola, soy el asistente virtual de Saba',
              status: 'delivered',
              errorDetail: null,
              hasMedia: false,
              waTimestamp: '2026-10-07T15:00:00.000Z',
            },
          ],
        })
      )
    );
    const user = userEvent.setup();
    render(<ChatsPage />);
    await user.click(await screen.findByRole('button', { name: /Ana Pérez/ }));

    const thread = await screen.findByRole('list', { name: 'Mensajes' });
    expect(within(thread).getByText('🤖 Asistente')).toBeInTheDocument();
    expect(
      within(thread).getByText('Hola, soy el asistente virtual de Saba')
    ).toBeInTheDocument();
  });

  it('turns the assistant off and on in the open chat', async () => {
    const sent: unknown[] = [];
    let enabled = true;
    server.use(
      http.put(`${base}/:id/assistant`, async ({ request }) => {
        const body = (await request.json()) as { enabled: boolean };
        sent.push(body);
        enabled = body.enabled;
        return HttpResponse.json({ success: true, data: null });
      }),
      http.get(base, () =>
        HttpResponse.json({
          success: true,
          data: conversationsFixture().map((c) => ({
            ...c,
            assistantEnabled: c.id === 'conv-open' ? enabled : true,
          })),
        })
      )
    );
    const user = userEvent.setup();
    render(<ChatsPage />);
    await user.click(await screen.findByRole('button', { name: /Ana Pérez/ }));

    const toggle = await screen.findByRole('switch', { name: /Asistente/ });
    expect(toggle).toBeChecked();

    await user.click(toggle);
    await waitFor(() => expect(toggle).not.toBeChecked());
    await user.click(toggle);
    await waitFor(() => expect(toggle).toBeChecked());

    expect(sent).toEqual([{ enabled: false }, { enabled: true }]);
  });

  it('shows the assistant off in a chat a person took over', async () => {
    server.use(
      http.get(base, () =>
        HttpResponse.json({
          success: true,
          data: conversationsFixture().map((c) => ({
            ...c,
            assistantEnabled: false,
          })),
        })
      )
    );
    const user = userEvent.setup();
    render(<ChatsPage />);
    await user.click(await screen.findByRole('button', { name: /Ana Pérez/ }));

    expect(
      await screen.findByRole('switch', { name: /Asistente/ })
    ).not.toBeChecked();
  });

  it('sends the reply and clears the composer', async () => {
    let sent: unknown;
    server.use(
      http.post(`${base}/:id/messages`, async ({ request }) => {
        sent = await request.json();
        return HttpResponse.json(
          {
            success: true,
            data: {
              id: 'm3',
              direction: 'outbound',
              source: 'system',
              type: 'text',
              body: 'Sí, la tenemos',
              status: 'sent',
              errorDetail: null,
              hasMedia: false,
              waTimestamp: new Date().toISOString(),
            },
          },
          { status: 201 }
        );
      })
    );
    const user = userEvent.setup();
    render(<ChatsPage />);
    await user.click(await screen.findByRole('button', { name: /Ana Pérez/ }));

    const box = await screen.findByLabelText('Mensaje');
    await user.type(box, 'Sí, la tenemos');
    await user.click(screen.getByRole('button', { name: 'Enviar' }));

    await waitFor(() => expect(sent).toEqual({ body: 'Sí, la tenemos' }));
    await waitFor(() => expect(box).toHaveValue(''));
  });

  it('tells Meta someone is typing, only once per burst of keystrokes', async () => {
    const notices: string[] = [];
    server.use(
      http.post(`${base}/:id/typing`, ({ params }) => {
        notices.push(String(params.id));
        return HttpResponse.json({ success: true, data: null });
      })
    );
    const user = userEvent.setup();
    render(<ChatsPage />);
    await user.click(await screen.findByRole('button', { name: /Ana Pérez/ }));

    await user.type(
      await screen.findByLabelText('Mensaje'),
      'Hola, ¿cómo estás?'
    );

    await waitFor(() => expect(notices).toEqual(['conv-open']));
  });

  it('shows the API error if WhatsApp rejects the send', async () => {
    server.use(
      http.post(`${base}/:id/messages`, () =>
        HttpResponse.json(
          {
            success: false,
            error:
              'Este número no está en la lista de destinatarios permitidos del número de prueba.',
            code: 'WHATSAPP_RECIPIENT_NOT_ALLOWED',
          },
          { status: 422 }
        )
      )
    );
    const user = userEvent.setup();
    render(<ChatsPage />);
    await user.click(await screen.findByRole('button', { name: /Ana Pérez/ }));

    await user.type(await screen.findByLabelText('Mensaje'), 'Hola');
    await user.click(screen.getByRole('button', { name: 'Enviar' }));

    expect(
      await screen.findByText(/destinatarios permitidos/)
    ).toBeInTheDocument();
  });

  it('locks the composer with the 24 h window closed', async () => {
    const user = userEvent.setup();
    render(<ChatsPage />);

    await user.click(
      await screen.findByRole('button', { name: /\+58 424 999 9999/ })
    );

    expect(await screen.findByText(/Pasaron más de 24 h/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Mensaje')).not.toBeInTheDocument();
  });

  it('shows the scroll-down arrow only if you scrolled up to read, and scrolls down when tapped', async () => {
    const user = userEvent.setup();
    render(<ChatsPage />);
    await user.click(await screen.findByRole('button', { name: /Ana Pérez/ }));
    const list = await screen.findByRole('list', { name: 'Mensajes' });
    const container = list.parentElement as HTMLElement;
    expect(
      screen.queryByRole('button', { name: /Ir a los mensajes más nuevos/ })
    ).not.toBeInTheDocument();

    // jsdom does no layout: we simulate having scrolled up 600 px in a 1000 px thread.
    Object.defineProperty(container, 'scrollHeight', {
      configurable: true,
      value: 1000,
    });
    Object.defineProperty(container, 'clientHeight', {
      configurable: true,
      value: 300,
    });
    container.scrollTop = 100;
    fireEvent.scroll(container);

    await user.click(
      await screen.findByRole('button', {
        name: /Ir a los mensajes más nuevos/,
      })
    );

    expect(
      screen.queryByRole('button', { name: /Ir a los mensajes más nuevos/ })
    ).not.toBeInTheDocument();
  });

  it('goes back to the list from the thread (narrow screens)', async () => {
    const user = userEvent.setup();
    render(<ChatsPage />);
    await user.click(await screen.findByRole('button', { name: /Ana Pérez/ }));
    expect(
      await screen.findByRole('list', { name: 'Mensajes' })
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: 'Volver a los chats' })
    );

    expect(
      screen.queryByRole('list', { name: 'Mensajes' })
    ).not.toBeInTheDocument();
    expect(
      screen.getByText('Elige una conversación para ver los mensajes.')
    ).toBeInTheDocument();
  });

  describe('contact detail', () => {
    /** Opens Ana's chat and her detail from the header (no matchMedia in jsdom: sliding panel). */
    async function openAnaDetail(): Promise<HTMLElement> {
      const user = userEvent.setup();
      render(<ChatsPage />);
      await user.click(
        await screen.findByRole('button', { name: /Ana Pérez/ })
      );
      await user.click(
        await screen.findByRole('button', { name: 'Ver detalle de Ana Pérez' })
      );
      return screen.findByRole('dialog', { name: 'Info. del contacto' });
    }

    it('is not shown until the chat header is tapped', async () => {
      const user = userEvent.setup();
      render(<ChatsPage />);
      await user.click(
        await screen.findByRole('button', { name: /Ana Pérez/ })
      );
      await screen.findByRole('list', { name: 'Mensajes' });

      expect(
        screen.queryByRole('dialog', { name: 'Info. del contacto' })
      ).not.toBeInTheDocument();
    });

    it('shows who they are in Saba, organized by sections', async () => {
      const panel = await openAnaDetail();

      expect(
        await within(panel).findByText('Ana María González')
      ).toBeInTheDocument();
      expect(
        within(panel).getByText('+58 414 123 4567', { selector: 'p' })
      ).toBeInTheDocument();
      expect(
        within(panel).getByText(/Cliente de Saba desde/)
      ).toBeInTheDocument();
      const identification = within(panel).getByRole('region', {
        name: 'Identificación',
      });
      expect(within(identification).getByText('V12345678')).toBeInTheDocument();
      expect(within(panel).getByRole('note')).toHaveTextContent(
        /solo por teléfono.*cédula.*correo/
      );
      const applications = within(panel).getByRole('region', {
        name: 'Solicitudes (1)',
      });
      expect(within(applications).getByText('CF 450MT')).toBeInTheDocument();
      expect(
        within(applications).getByText('Cita agendada')
      ).toBeInTheDocument();
      expect(
        within(applications).getByText('$40,00 semanal')
      ).toBeInTheDocument();
    });

    it('copies the ID number to the clipboard', async () => {
      const user = userEvent.setup();
      // After setup(): user-event replaces navigator.clipboard with its own.
      const writeText = jest.spyOn(navigator.clipboard, 'writeText');
      render(<ChatsPage />);
      await user.click(
        await screen.findByRole('button', { name: /Ana Pérez/ })
      );
      await user.click(
        await screen.findByRole('button', { name: 'Ver detalle de Ana Pérez' })
      );
      const panel = await screen.findByRole('dialog', {
        name: 'Info. del contacto',
      });

      await user.click(
        await within(panel).findByRole('button', { name: 'Copiar cédula' })
      );

      expect(writeText).toHaveBeenCalledWith('V12345678');
      expect(
        await within(panel).findByRole('button', { name: 'Copiado' })
      ).toBeInTheDocument();
    });

    it('lets you choose when several profiles share the same number', async () => {
      server.use(
        http.get(`${base}/:id/saba-customer`, () =>
          HttpResponse.json({
            success: true,
            data: {
              noPhone: false,
              customers: [
                sabaCustomerFixture,
                {
                  ...sabaCustomerFixture,
                  id: 'p2',
                  name: 'José González',
                  idNumber: 'V87654321',
                },
              ],
            },
          })
        )
      );
      const panel = await openAnaDetail();

      expect(
        await within(panel).findByText('Hay 2 perfiles con este número:')
      ).toBeInTheDocument();
      await userEvent
        .setup()
        .click(within(panel).getByRole('button', { name: 'José González' }));

      expect(within(panel).getByText('V87654321')).toBeInTheDocument();
    });

    it('warns when the number is not in Saba', async () => {
      server.use(
        http.get(`${base}/:id/saba-customer`, () =>
          HttpResponse.json({
            success: true,
            data: { noPhone: false, customers: [] },
          })
        )
      );
      const panel = await openAnaDetail();

      expect(
        await within(panel).findByText('No está registrado en Saba')
      ).toBeInTheDocument();
      // Only the message: without the contact header, and with the hint to validate.
      expect(within(panel).queryByText('Ana Pérez')).not.toBeInTheDocument();
      expect(
        within(panel).getByText(/puede estar escribiendo desde otro teléfono/)
      ).toBeInTheDocument();
    });

    it('shows the Saba error and allows retrying without affecting the chat', async () => {
      let attempts = 0;
      server.use(
        http.get(`${base}/:id/saba-customer`, () => {
          attempts++;
          return HttpResponse.json(
            {
              success: false,
              error:
                'No se pudo consultar Saba en este momento. Intenta de nuevo en unos segundos.',
              code: 'SABA_CUSTOMERS_UNAVAILABLE',
            },
            { status: 424 }
          );
        })
      );
      const panel = await openAnaDetail();

      expect(
        await within(panel).findByText(
          /No se pudo consultar Saba/,
          {},
          { timeout: 3000 }
        )
      ).toBeInTheDocument();
      // The sliding panel is modal: it hides the thread from screen readers, but it is still there.
      expect(
        screen.getByRole('list', { name: 'Mensajes', hidden: true })
      ).toBeInTheDocument();
      const before = attempts;
      await userEvent
        .setup()
        .click(within(panel).getByRole('button', { name: 'Reintentar' }));
      await waitFor(() => expect(attempts).toBeGreaterThan(before));
    });
  });

  it('sends only once when Enter is pressed repeatedly while sending', async () => {
    let calls = 0;
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.post(`${base}/:id/messages`, async () => {
        calls++;
        await pending;
        return HttpResponse.json(
          { success: false, error: 'x' },
          { status: 500 }
        );
      })
    );
    const user = userEvent.setup();
    render(<ChatsPage />);
    await user.click(await screen.findByRole('button', { name: /Ana Pérez/ }));

    const box = await screen.findByLabelText('Mensaje');
    await user.type(box, 'Hola{Enter}{Enter}{Enter}');
    await user.keyboard('{Enter}');
    release();

    await waitFor(() => expect(calls).toBe(1));
  });

  it('does not send an empty message', async () => {
    let calls = 0;
    server.use(
      http.post(`${base}/:id/messages`, () => {
        calls++;
        return HttpResponse.json(
          { success: false, error: 'x' },
          { status: 400 }
        );
      })
    );
    const user = userEvent.setup();
    render(<ChatsPage />);
    await user.click(await screen.findByRole('button', { name: /Ana Pérez/ }));

    await user.click(await screen.findByRole('button', { name: 'Enviar' }));

    expect(await screen.findByText('Escribe un mensaje.')).toBeInTheDocument();
    expect(calls).toBe(0);
  });
});
