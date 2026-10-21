import { afterEach, describe, expect, it, vi } from 'vitest';
import { HttpSabaAssistantStores } from '../../modules/assistant/infrastructure/external/HttpSabaAssistantStores';

const CONFIG = {
  sabaApiUrl: 'http://saba.test',
  sabaAssistantKey: 'assistant-key',
};
const CATIA = {
  name: 'Catia',
  address: 'Av. Sucre',
  map_url: 'https://maps.app.goo.gl/x',
  public_hours: 'Lunes a viernes 8:00 a. m. a 5:00 p. m.',
};

function reply(status: number, body: unknown = { ok: status < 400 }): Response {
  return new Response(JSON.stringify(body), { status });
}

function setup(responses: Array<Response | Error>) {
  const fetchMock = vi.fn(async () => {
    const next = responses.shift();
    if (!next) throw new Error('sin respuesta preparada');
    if (next instanceof Error) throw next;
    return next;
  });
  vi.stubGlobal('fetch', fetchMock);
  let now = new Date('2026-10-21T15:00:00Z').getTime();
  const logger = { warn: vi.fn(), error: vi.fn() };
  const stores = new HttpSabaAssistantStores(
    CONFIG,
    { now: () => new Date(now) },
    logger
  );
  return {
    stores,
    fetchMock,
    logger,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

describe('HttpSabaAssistantStores', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('asks Saba with the assistant key and maps the stores', async () => {
    const { stores, fetchMock } = setup([
      reply(200, { ok: true, stores: [CATIA] }),
    ]);

    expect(await stores.current()).toEqual({
      stores: [
        {
          name: 'Catia',
          address: 'Av. Sucre',
          mapUrl: 'https://maps.app.goo.gl/x',
          publicHours: 'Lunes a viernes 8:00 a. m. a 5:00 p. m.',
        },
      ],
      misconfigured: false,
    });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      URL,
      RequestInit,
    ];
    expect(String(url)).toBe('http://saba.test/api/assistant/stores');
    expect(init.headers).toEqual({ 'X-Saba-Assistant-Key': 'assistant-key' });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('keeps the copy for 5 minutes and then refreshes it', async () => {
    const { stores, fetchMock, advance } = setup([
      reply(200, { ok: true, stores: [CATIA] }),
      reply(200, { ok: true, stores: [] }),
    ]);

    await stores.current();
    advance(4 * 60 * 1000);
    expect((await stores.current()).stores).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    advance(2 * 60 * 1000);
    expect((await stores.current()).stores).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('uses the last good copy when Saba is down or slow', async () => {
    const { stores, advance, logger } = setup([
      reply(200, { ok: true, stores: [CATIA] }),
      new DOMException('timeout', 'TimeoutError'),
      reply(500),
    ]);

    await stores.current();
    advance(6 * 60 * 1000);
    expect((await stores.current()).stores).toHaveLength(1);
    advance(2 * 60 * 1000);
    expect((await stores.current()).stores).toHaveLength(1);
    expect(logger.warn).toHaveBeenCalled();
  });

  it('waits a minute before asking a failing Saba again', async () => {
    const { stores, fetchMock, advance } = setup([
      reply(503),
      reply(200, { ok: true, stores: [CATIA] }),
    ]);

    expect((await stores.current()).stores).toBeNull();
    advance(30 * 1000);
    expect((await stores.current()).stores).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    advance(31 * 1000);
    expect((await stores.current()).stores).toHaveLength(1);
  });

  it('reports a rejected key as a configuration error and stops asking', async () => {
    const { stores, logger, fetchMock, advance } = setup([
      reply(200, { ok: true, stores: [CATIA] }),
      reply(401, { ok: false, code: 'invalid_assistant_key' }),
    ]);

    await stores.current();
    advance(6 * 60 * 1000);
    expect(await stores.current()).toMatchObject({ misconfigured: true });
    advance(60 * 60 * 1000);
    expect(await stores.current()).toMatchObject({ misconfigured: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('SABA_ASSISTANT_KEY'),
      undefined,
      'Assistant'
    );
  });

  it('treats an unexpected answer as Saba failing', async () => {
    const { stores } = setup([reply(200, { ok: true, sedes: [] })]);
    expect((await stores.current()).stores).toBeNull();
  });

  it('does not call Saba without configuration', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const logger = { warn: vi.fn(), error: vi.fn() };
    const stores = new HttpSabaAssistantStores(
      { sabaApiUrl: null, sabaAssistantKey: null },
      { now: () => new Date() },
      logger
    );

    expect(await stores.current()).toEqual({
      stores: null,
      misconfigured: true,
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalled();
  });
});
