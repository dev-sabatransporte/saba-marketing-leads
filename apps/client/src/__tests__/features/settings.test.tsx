import type { TAssistantSettings } from '@repo/schemas';
import { HttpResponse, http } from 'msw';
import React from 'react';
import { BACKEND_URL } from '@/__tests__/mocks/backendUrl';
import { assistantSettingsFixture } from '@/__tests__/mocks/handlers/assistantSettings.mock';
import { sessionUserFixture } from '@/__tests__/mocks/handlers/session.mock';
import SettingsRoute from '@/app/(app)/settings/page';
import { server } from '../mocks/server';
import {
  render,
  screen,
  userEvent,
  waitFor,
  within,
} from '../test-utils/test-utils';

const settingsUrl = `${BACKEND_URL}/v1/assistant/settings`;

function asManager(): void {
  server.use(
    http.get(`${BACKEND_URL}/v1/me`, () =>
      HttpResponse.json({
        success: true,
        data: {
          ...sessionUserFixture,
          permissions: ['marketing:access', 'assistant:manage'],
        },
      })
    )
  );
}

/** Answers each PATCH with the fixture plus the patch, as the API would. */
function recordPatches(): unknown[] {
  const patches: unknown[] = [];
  server.use(
    http.patch(settingsUrl, async ({ request }) => {
      const patch = (await request.json()) as Partial<TAssistantSettings>;
      patches.push(patch);
      return HttpResponse.json({
        success: true,
        data: { ...assistantSettingsFixture(), ...patch },
      });
    })
  );
  return patches;
}

describe('Settings page', () => {
  it('does not show the settings without assistant:manage, nor ask the API for them', async () => {
    let asked = false;
    server.use(
      http.get(settingsUrl, () => {
        asked = true;
        return HttpResponse.json({
          success: false,
          error: 'No tienes acceso.',
        });
      })
    );
    render(<SettingsRoute />);

    expect(
      await screen.findByText('No tienes acceso a esta sección')
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('switch', { name: 'Asistente encendido' })
    ).not.toBeInTheDocument();
    expect(asked).toBe(false);
  });

  it('shows the assistant settings with who changed each one', async () => {
    asManager();
    render(<SettingsRoute />);

    const section = await screen.findByRole('region', { name: 'Asistente' });
    const enabled = await within(section).findByRole('switch', {
      name: 'Asistente encendido',
    });
    expect(enabled).not.toBeChecked();
    expect(
      within(section).getByRole('switch', { name: 'Respuestas simples' })
    ).toBeChecked();
    expect(
      within(section).getByLabelText('Respuestas por cliente al día')
    ).toHaveValue(20);
    expect(within(section).getByLabelText('Espera (segundos)')).toHaveValue(8);
    expect(
      within(section).getByLabelText('Espera máxima (segundos)')
    ).toHaveValue(30);
    expect(
      within(section).getByLabelText('Respuestas totales al día')
    ).toHaveValue(300);
    // 14:30 UTC is 10:30 in Venezuela.
    expect(
      within(section).getByText(
        /Cambiado por María Gómez · 20 oct\. 2026, 10:30/
      )
    ).toBeInTheDocument();
    expect(within(section).getAllByText('Sin cambios')).toHaveLength(5);
  });

  it('turns the assistant on from the switch', async () => {
    asManager();
    const patches = recordPatches();
    const user = userEvent.setup();
    render(<SettingsRoute />);

    const enabled = await screen.findByRole('switch', {
      name: 'Asistente encendido',
    });
    await user.click(enabled);

    await waitFor(() => expect(enabled).toBeChecked());
    expect(patches).toEqual([{ enabled: true }]);
  });

  it('saves the limits together', async () => {
    asManager();
    const patches = recordPatches();
    const user = userEvent.setup();
    render(<SettingsRoute />);

    const save = await screen.findByRole('button', { name: 'Guardar límites' });
    expect(save).toBeDisabled();

    const daily = screen.getByLabelText('Respuestas totales al día');
    await user.clear(daily);
    await user.type(daily, '150');
    await user.click(save);

    expect(await screen.findByText('Límites guardados.')).toBeInTheDocument();
    expect(patches).toEqual([
      {
        perContactDailyLimit: 20,
        debounceSeconds: 8,
        maxWaitSeconds: 30,
        dailyReplyLimit: 150,
      },
    ]);
    expect(screen.getByLabelText('Respuestas totales al día')).toHaveValue(150);
  });

  it('does not save limits out of range or a maximum wait below the wait', async () => {
    asManager();
    const patches = recordPatches();
    const user = userEvent.setup();
    render(<SettingsRoute />);

    const perContact = await screen.findByLabelText(
      'Respuestas por cliente al día'
    );
    await user.clear(perContact);
    await user.type(perContact, '0');
    const maxWait = screen.getByLabelText('Espera máxima (segundos)');
    await user.clear(maxWait);
    await user.type(maxWait, '5');
    await user.click(screen.getByRole('button', { name: 'Guardar límites' }));

    expect(await screen.findByText('El mínimo es 1.')).toBeInTheDocument();
    expect(
      screen.getByText('La espera máxima no puede ser menor que la espera.')
    ).toBeInTheDocument();
    expect(patches).toEqual([]);
  });

  it('shows the API error when saving fails', async () => {
    asManager();
    server.use(
      http.patch(settingsUrl, () =>
        HttpResponse.json(
          {
            success: false,
            code: 'AUTH_PERMISSION_DENIED',
            error: 'No tienes permiso para esta acción.',
          },
          { status: 403 }
        )
      )
    );
    const user = userEvent.setup();
    render(<SettingsRoute />);

    await user.click(
      await screen.findByRole('switch', { name: 'Respuestas simples' })
    );

    expect(
      await screen.findByText('No tienes permiso para esta acción.')
    ).toBeInTheDocument();
  });
});
