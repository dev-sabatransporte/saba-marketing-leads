import { afterEach, describe, expect, it, vi } from 'vitest';
import { AccountLockedException } from '../../modules/auth/domain/exceptions/AccountLockedException';
import { AuthUnavailableException } from '../../modules/auth/domain/exceptions/AuthUnavailableException';
import { InvalidCredentialsException } from '../../modules/auth/domain/exceptions/InvalidCredentialsException';
import { InvalidSessionException } from '../../modules/auth/domain/exceptions/InvalidSessionException';
import { NoAccessException } from '../../modules/auth/domain/exceptions/NoAccessException';
import { TooManyAttemptsException } from '../../modules/auth/domain/exceptions/TooManyAttemptsException';
import { HttpSabaAuthGateway } from '../../modules/auth/infrastructure/external/HttpSabaAuthGateway';

const CONFIG = { apiUrl: 'http://saba.test', serviceKey: 'service-key' };
const CLIENT = { ip: '190.1.2.3', userAgent: 'Firefox' };

const SABA_SESSION = {
  accessToken: 'access',
  refreshToken: 'refresh',
  expiresAt: 1_791_400_000,
  userId: 'u-1',
};
const SABA_USER = {
  id: 'u-1',
  email: 'agente@sabatransporte.com',
  name: 'Angel Hernández',
  role: 'admin',
  permissions: ['marketing:access'],
};

function reply(status: number, body: unknown = { ok: status < 400 }): Response {
  return new Response(JSON.stringify(body), { status });
}

function stubFetch(response: Response) {
  const fetchMock = vi.fn(async () => response);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function callOf(fetchMock: ReturnType<typeof stubFetch>): [URL, RequestInit] {
  return fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
}

const gateway = new HttpSabaAuthGateway(CONFIG);

describe('HttpSabaAuthGateway', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('logs in with the service key and forwards who the agent is', async () => {
    const fetchMock = stubFetch(
      reply(200, { ok: true, session: SABA_SESSION, user: SABA_USER })
    );

    const result = await gateway.login('a@b.com', 'secret', CLIENT);

    const [url, init] = callOf(fetchMock);
    expect(String(url)).toBe('http://saba.test/api/marketing/auth/login');
    expect(init.headers).toMatchObject({
      'X-Saba-Service-Key': 'service-key',
      'X-Marketing-Client-Ip': '190.1.2.3',
      'X-Marketing-User-Agent': 'Firefox',
    });
    expect(JSON.parse(String(init.body))).toEqual({
      email: 'a@b.com',
      password: 'secret',
    });
    expect(result.session.accessToken).toBe('access');
    expect(result.user).toEqual(SABA_USER);
  });

  it.each([
    [400, {}, InvalidCredentialsException],
    [401, {}, InvalidCredentialsException],
    [403, { code: 'no_marketing_access' }, NoAccessException],
    [403, { code: 'wrong_portal' }, NoAccessException],
    [423, { code: 'account_locked' }, AccountLockedException],
    [429, { code: 'rate_limited' }, TooManyAttemptsException],
    [401, { code: 'invalid_service_key' }, AuthUnavailableException],
    [500, {}, AuthUnavailableException],
  ])('maps a login answered %i %o', async (status, body, exception) => {
    stubFetch(reply(status, { ok: false, ...body }));

    await expect(gateway.login('a@b.com', 'x', CLIENT)).rejects.toThrow(
      exception
    );
  });

  it('reads the session user with the agent token and drops unknown permissions', async () => {
    const fetchMock = stubFetch(
      reply(200, {
        ok: true,
        user: { ...SABA_USER, permissions: ['marketing:access', 'future:x'] },
      })
    );

    const user = await gateway.findSessionUser('access');

    const [url, init] = callOf(fetchMock);
    expect(String(url)).toBe('http://saba.test/api/marketing/session');
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer access',
      'X-Saba-Service-Key': 'service-key',
    });
    expect(user.permissions).toEqual(['marketing:access']);
  });

  it('keeps assistant:manage when Saba grants it', async () => {
    stubFetch(
      reply(200, {
        ok: true,
        user: {
          ...SABA_USER,
          permissions: ['marketing:access', 'assistant:manage'],
        },
      })
    );

    const user = await gateway.findSessionUser('access');

    expect(user.permissions).toEqual(['marketing:access', 'assistant:manage']);
  });

  it('tells an expired session apart from a wrong service key', async () => {
    stubFetch(reply(401, { ok: false }));
    await expect(gateway.findSessionUser('t')).rejects.toThrow(
      InvalidSessionException
    );

    stubFetch(reply(401, { ok: false, code: 'invalid_service_key' }));
    await expect(gateway.findSessionUser('t')).rejects.toThrow(
      AuthUnavailableException
    );

    stubFetch(reply(403, { ok: false, code: 'no_marketing_access' }));
    await expect(gateway.findSessionUser('t')).rejects.toThrow(
      NoAccessException
    );
  });

  it('reports Saba as unavailable if it cannot be reached or changes its answer', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('fetch failed');
      })
    );
    await expect(gateway.findSessionUser('t')).rejects.toThrow(
      AuthUnavailableException
    );

    stubFetch(
      reply(200, { ok: true, user: { ...SABA_USER, role: 'standard' } })
    );
    await expect(gateway.findSessionUser('t')).rejects.toThrow(
      AuthUnavailableException
    );
  });

  it('refreshes, and returns null for a refresh token Saba rejects', async () => {
    stubFetch(reply(200, { ok: true, session: SABA_SESSION }));
    await expect(gateway.refresh('refresh')).resolves.toMatchObject({
      accessToken: 'access',
      userId: 'u-1',
    });

    stubFetch(reply(401, { ok: false }));
    await expect(gateway.refresh('used')).resolves.toBeNull();
  });

  it('treats logging out an already closed session as done', async () => {
    stubFetch(new Response(null, { status: 204 }));
    await expect(gateway.logout('t')).resolves.toBeUndefined();

    stubFetch(reply(401, { ok: false }));
    await expect(gateway.logout('t')).resolves.toBeUndefined();
  });
});
