import { describe, expect, it } from 'vitest';
import { createLogger, REDACTED, sanitize, type LoggerOptions } from './index';

function collect(options: Partial<LoggerOptions> = {}) {
  const lines: string[] = [];
  const logger = createLogger({
    app: 'storefront',
    level: 'info',
    env: 'test',
    write: (line) => lines.push(line),
    now: () => new Date('2026-10-14T08:00:00.000Z'),
    ...options,
  });
  const parsed = () => lines.map((line) => JSON.parse(line) as Record<string, unknown>);
  return { logger, lines, parsed };
}

describe('createLogger', () => {
  it('writes one JSON line per entry with the base fields', () => {
    const { logger, lines, parsed } = collect();
    logger.info('BFF request', { status: 200, route: 'GET /cart' });
    expect(lines).toHaveLength(1);
    expect(lines[0]?.endsWith('\n')).toBe(true);
    expect(parsed()[0]).toEqual({
      level: 'info',
      timestamp: '2026-10-14T08:00:00.000Z',
      message: 'BFF request',
      app: 'storefront',
      env: 'test',
      status: 200,
      route: 'GET /cart',
    });
  });

  it('drops entries below the configured level', () => {
    const { logger, parsed } = collect({ level: 'warn' });
    logger.debug('a');
    logger.info('b');
    logger.warn('c');
    logger.error('d');
    logger.fatal('e');
    expect(parsed().map((line) => line.message)).toEqual(['c', 'd', 'e']);
  });

  it('adds child fields to every line, and line fields win over them', () => {
    const { logger, parsed } = collect();
    const child = logger.child({ correlationId: 'c-1', userId: 'u-1' });
    child.info('x', { userId: 'u-2' });
    expect(parsed()[0]).toMatchObject({ correlationId: 'c-1', userId: 'u-2' });
  });

  it('never lets fields overwrite the base keys', () => {
    const { logger, parsed } = collect();
    logger.info('real', { level: 'debug', message: 'fake', app: 'other' });
    expect(parsed()[0]).toMatchObject({ level: 'info', message: 'real', app: 'storefront' });
  });

  it('redacts secrets and personal data at any depth, case-insensitively', () => {
    const { logger, lines } = collect();
    logger.info('x', {
      accessToken: 'eyJ.secret.jwt',
      nested: { RefreshToken: 'r'.repeat(43), headers: { Authorization: 'Bearer abc', cookie: 'a=b' } },
      body: [{ password: 'hunter2', street: '1 Nile St', phone: '+201001234567' }],
      refundPayout: {
        method: 'mobile_wallet',
        walletNumber: '+201112223334',
        instapayAddress: 'mona@instapay',
      },
      userId: 'u-1',
    });
    const line = lines[0] ?? '';
    const secrets = ['eyJ.secret.jwt', 'rrrr', 'Bearer abc', 'a=b', 'hunter2', 'Nile St', '+2010', '+2011'];
    for (const secret of [...secrets, 'mona@instapay']) {
      expect(line).not.toContain(secret);
    }
    expect(line).toContain(REDACTED);
    expect(line).toContain('u-1');
  });
});

describe('sanitize', () => {
  it('serialises errors with their cause', () => {
    const error = new Error('outer', { cause: new Error('inner') });
    expect(sanitize(error)).toMatchObject({
      name: 'Error',
      message: 'outer',
      cause: { name: 'Error', message: 'inner' },
    });
  });

  it('cuts off deep structures instead of looping', () => {
    const deep = { a: { b: { c: { d: { e: { f: { g: { h: 1 } } } } } } } };
    expect(JSON.stringify(sanitize(deep))).toContain('[Truncated]');
  });
});
