import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { assistantPendingReplies } from '../../modules/assistant/infrastructure/persistence/assistant.schema';
import { DrizzlePendingRepliesRepository } from '../../modules/assistant/infrastructure/persistence/DrizzlePendingRepliesRepository';
import { closeTestDb, getTestDb, resetDatabase } from '../support/testDatabase';

const WAIT = { debounceSeconds: 8, maxWaitSeconds: 30 };
const at = (seconds: number) =>
  new Date(Date.parse('2026-10-22T15:00:00Z') + seconds * 1000);
const LEASE_SECONDS = 120;
const claimAt = (seconds: number, limit = 10) => ({
  now: at(seconds),
  staleBefore: at(seconds - LEASE_SECONDS),
  limit,
});

describe('pending replies (against Postgres)', () => {
  const chat = crypto.randomUUID();
  const other = crypto.randomUUID();
  const [m1, m2, m3] = [
    crypto.randomUUID(),
    crypto.randomUUID(),
    crypto.randomUUID(),
  ];
  let pending: DrizzlePendingRepliesRepository;

  afterAll(async () => {
    await closeTestDb();
  });

  beforeEach(async () => {
    await resetDatabase();
    pending = new DrizzlePendingRepliesRepository(getTestDb());
  });

  it('claims a batch only once its wait is over, with all its messages', async () => {
    await pending.add(chat, m1, at(0), WAIT);
    await pending.add(chat, m2, at(5), WAIT);

    expect(await pending.claimDue(claimAt(12))).toEqual([]);
    expect(await pending.claimDue(claimAt(13))).toEqual([
      { conversationId: chat, messageIds: [m1, m2], claimedAt: at(13) },
    ]);
    // Already claimed: a second sweep does not get it.
    expect(await pending.claimDue(claimAt(14))).toEqual([]);
  });

  it('two sweeps at once never claim the same batch', async () => {
    await pending.add(chat, m1, at(0), WAIT);
    await pending.add(other, m2, at(0), WAIT);

    const [a, b] = await Promise.all([
      pending.claimDue(claimAt(10)),
      pending.claimDue(claimAt(10)),
    ]);

    const claimed = [...a, ...b].map((batch) => batch.conversationId);
    expect(claimed.sort()).toEqual([chat, other].sort());
  });

  it('messages that arrive during a turn wait for it to end, then form the next batch', async () => {
    await pending.add(chat, m1, at(0), WAIT);
    const [first] = await pending.claimDue(claimAt(8));
    if (!first) throw new Error('sin lote');

    await pending.add(chat, m2, at(9), WAIT);
    expect(await pending.claimDue(claimAt(20))).toEqual([]);

    await pending.release(first);
    expect(await pending.claimDue(claimAt(20))).toEqual([
      { conversationId: chat, messageIds: [m2], claimedAt: at(20) },
    ]);
  });

  it('removes the row once nothing is pending', async () => {
    await pending.add(chat, m1, at(0), WAIT);
    const [batch] = await pending.claimDue(claimAt(8));
    if (!batch) throw new Error('sin lote');

    await pending.release(batch);

    expect(await getTestDb().select().from(assistantPendingReplies)).toEqual(
      []
    );
  });

  it('takes a claim back once its lease ran out, with the new messages too', async () => {
    await pending.add(chat, m1, at(0), WAIT);
    await pending.claimDue(claimAt(8));
    await pending.add(chat, m2, at(30), WAIT);

    expect(await pending.claimDue(claimAt(8 + LEASE_SECONDS - 1))).toEqual([]);
    expect(await pending.claimDue(claimAt(9 + LEASE_SECONDS))).toEqual([
      {
        conversationId: chat,
        messageIds: [m1, m2],
        claimedAt: at(9 + LEASE_SECONDS),
      },
    ]);
  });

  it('a late release of a claim taken back does not drop the new one', async () => {
    await pending.add(chat, m1, at(0), WAIT);
    const [stale] = await pending.claimDue(claimAt(8));
    if (!stale) throw new Error('sin lote');
    await pending.claimDue(claimAt(9 + LEASE_SECONDS));

    await pending.release(stale);

    const [row] = await getTestDb().select().from(assistantPendingReplies);
    expect(row).toMatchObject({
      claimedIds: [m1],
      claimedAt: at(9 + LEASE_SECONDS),
    });
  });

  it('claims the oldest due first, up to the limit', async () => {
    await pending.add(chat, m1, at(5), WAIT);
    await pending.add(other, m2, at(0), WAIT);
    await pending.add(crypto.randomUUID(), m3, at(3), WAIT);

    const claimed = await pending.claimDue(claimAt(30, 2));

    expect(claimed.map((batch) => batch.messageIds)).toEqual([[m2], [m3]]);
  });
});
