import { afterEach, describe, expect, it, vi } from 'vitest';
import { CatalogUnavailableError } from '../../modules/assistant/domain/AssistantErrors';
import { HttpSabaAssistantProducts } from '../../modules/assistant/infrastructure/external/HttpSabaAssistantProducts';

const CONFIG = {
  sabaApiUrl: 'http://saba.test',
  sabaAssistantKey: 'assistant-key',
};
const BERA = {
  name: 'Moto Bera SBR 150',
  model: 'SBR 150',
  brand: 'Bera',
  categories: ['Motos'],
  in_stock: true,
};

function reply(status: number, body: unknown = { ok: status < 400 }): Response {
  return new Response(JSON.stringify(body), { status });
}

function setup(response: Response | Error) {
  const fetchMock = vi.fn(async () => {
    if (response instanceof Error) throw response;
    return response;
  });
  vi.stubGlobal('fetch', fetchMock);
  const logger = { warn: vi.fn(), error: vi.fn() };
  const products = new HttpSabaAssistantProducts(CONFIG, logger);
  return { products, fetchMock, logger };
}

describe('HttpSabaAssistantProducts', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('searches Saba with the assistant key and maps the products', async () => {
    const { products, fetchMock } = setup(
      reply(200, { ok: true, products: [BERA] })
    );

    expect(await products.search('moto bera')).toEqual([
      {
        name: 'Moto Bera SBR 150',
        model: 'SBR 150',
        brand: 'Bera',
        categories: ['Motos'],
        inStock: true,
      },
    ]);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      URL,
      RequestInit,
    ];
    expect(String(url)).toBe(
      'http://saba.test/api/assistant/products?search=moto+bera'
    );
    expect(init.headers).toEqual({ 'X-Saba-Assistant-Key': 'assistant-key' });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('keeps only the public fields even if Saba sends more', async () => {
    const { products } = setup(
      reply(200, {
        ok: true,
        products: [{ ...BERA, id: 'p-1', price: 1200, model: null }],
      })
    );

    expect(await products.search('bera')).toEqual([
      {
        name: 'Moto Bera SBR 150',
        model: null,
        brand: 'Bera',
        categories: ['Motos'],
        inStock: true,
      },
    ]);
  });

  it('treats a search Saba finds no words in as no results', async () => {
    const { products, logger } = setup(
      reply(400, { ok: false, code: 'missing_search' })
    );

    expect(await products.search('¿?')).toEqual([]);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it.each([
    ['too many requests', reply(429, { ok: false })],
    ['an outage', reply(503)],
    ['a timeout', new DOMException('timeout', 'TimeoutError')],
    ['an unexpected answer', reply(200, { ok: true, productos: [] })],
  ])('reports %s as Saba being unavailable', async (_case, response) => {
    const { products, logger } = setup(response);

    const error = await products.search('bera').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(CatalogUnavailableError);
    expect(error).toMatchObject({ misconfigured: false });
    expect(logger.warn).toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('reports a rejected key as a configuration error', async () => {
    const { products, logger } = setup(
      reply(401, { ok: false, code: 'invalid_assistant_key' })
    );

    await expect(products.search('bera')).rejects.toMatchObject({
      misconfigured: true,
    });
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('SABA_ASSISTANT_KEY'),
      undefined,
      'Assistant'
    );
  });

  it('does not call Saba without configuration', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const products = new HttpSabaAssistantProducts(
      { sabaApiUrl: null, sabaAssistantKey: null },
      { warn: vi.fn(), error: vi.fn() }
    );

    await expect(products.search('bera')).rejects.toMatchObject({
      misconfigured: true,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
