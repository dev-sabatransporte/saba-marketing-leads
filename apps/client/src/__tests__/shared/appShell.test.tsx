import { HttpResponse, http } from 'msw';
import React from 'react';
import { BACKEND_URL } from '@/__tests__/mocks/backendUrl';
import { sessionUserFixture } from '@/__tests__/mocks/handlers/session.mock';
import { SessionAppShell } from '@/features/auth/ui/layouts/SessionAppShell';
import { server } from '../mocks/server';
import { render, screen, userEvent, waitFor } from '../test-utils/test-utils';

let pathname = '/';
jest.mock('next/navigation', () => ({
  usePathname: () => pathname,
}));

const assign = jest.fn();
jest.mock('@/lib/session/reloadIn', () => ({
  reloadIn: (path: string) => assign(path),
}));

beforeAll(() => {
  // jsdom has no matchMedia (the sidebar uses it to detect mobile).
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }),
  });
});

function renderShell(): void {
  render(
    <SessionAppShell defaultOpen>
      <p>contenido</p>
    </SessionAppShell>
  );
}

describe('AppShell', () => {
  beforeEach(() => {
    pathname = '/';
    assign.mockClear();
  });

  it('shows the general navigation and highlights the current route', () => {
    pathname = '/chats';
    renderShell();

    expect(screen.getByText('General')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Inicio' })).toHaveAttribute(
      'href',
      '/'
    );
    const chats = screen.getByRole('link', { name: 'Chats' });
    expect(chats).toHaveAttribute('href', '/chats');
    expect(chats).toHaveAttribute('data-active', 'true');
    expect(screen.getByText('contenido')).toBeInTheDocument();
  });

  it('hides the settings without assistant:manage', async () => {
    renderShell();

    await screen.findByText('Angel Hernández');
    expect(
      screen.queryByRole('link', { name: 'Ajustes' })
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Administración')).not.toBeInTheDocument();
  });

  it('shows the settings to whoever has assistant:manage', async () => {
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
    pathname = '/settings';
    renderShell();

    const settings = await screen.findByRole('link', { name: 'Ajustes' });
    expect(settings).toHaveAttribute('href', '/settings');
    expect(settings).toHaveAttribute('data-active', 'true');
    expect(screen.getByText('Administración')).toBeInTheDocument();
  });

  it('shows who holds the session', async () => {
    renderShell();

    expect(await screen.findByText('Angel Hernández')).toBeInTheDocument();
    expect(
      screen.getByText('angel.hernandez@sabatransporte.com')
    ).toBeInTheDocument();
    expect(screen.getByText('Administrador')).toBeInTheDocument();
  });

  it('ends the session and goes back to the login', async () => {
    let closed = false;
    server.use(
      http.post('http://localhost/api/session/logout', () => {
        closed = true;
        return new HttpResponse(null, { status: 204 });
      })
    );
    const user = userEvent.setup();
    renderShell();

    await user.click(screen.getByRole('button', { name: 'Cerrar sesión' }));

    await waitFor(() => expect(assign).toHaveBeenCalledWith('/login'));
    expect(closed).toBe(true);
  });
});
