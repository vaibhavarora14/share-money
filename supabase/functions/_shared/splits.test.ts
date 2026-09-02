import { assertEquals } from 'jsr:@std/assert@1';
import {
  buildTransactionSplitRows,
  calculateEqualSplits,
  parseCustomSplits,
  resolveParticipantIdsForSplits,
  scaleSplitsToTotal,
  validateSplitSum,
} from './splits.ts';

const ALICE = '11111111-1111-1111-1111-111111111111';
const BOB = '22222222-2222-2222-2222-222222222222';
const CHARLIE = '33333333-3333-3333-3333-333333333333';

Deno.test('equal splits spread leftover cents with largest remainder', () => {
  assertEquals(calculateEqualSplits(100, [ALICE, BOB, CHARLIE]), [
    { participant_id: ALICE, amount: 33.34 },
    { participant_id: BOB, amount: 33.33 },
    { participant_id: CHARLIE, amount: 33.33 },
  ]);
  assertEquals(calculateEqualSplits(10.01, [ALICE, BOB, CHARLIE]), [
    { participant_id: ALICE, amount: 3.34 },
    { participant_id: BOB, amount: 3.34 },
    { participant_id: CHARLIE, amount: 3.33 },
  ]);
});

Deno.test('custom splits are accepted when they add up', () => {
  const parsed = parseCustomSplits([
    { participant_id: ALICE, amount: 60 },
    { participant_id: BOB, amount: 40 },
  ]);
  assertEquals(parsed, {
    present: true,
    splits: [
      { participant_id: ALICE, amount: 60 },
      { participant_id: BOB, amount: 40 },
    ],
  });

  const rows = buildTransactionSplitRows(9, 100, [ALICE, BOB], parsed.present && 'splits' in parsed ? parsed.splits : null);
  assertEquals(rows.error, undefined);
  assertEquals(rows.splits, [
    { transaction_id: 9, participant_id: ALICE, amount: 60 },
    { transaction_id: 9, participant_id: BOB, amount: 40 },
  ]);
});

Deno.test('custom splits that miss the total are rejected', () => {
  const rows = buildTransactionSplitRows(
    9,
    100,
    [ALICE, BOB],
    [
      { participant_id: ALICE, amount: 60 },
      { participant_id: BOB, amount: 30 },
    ],
  );
  assertEquals(rows.splits, []);
  assertEquals(typeof rows.error, 'string');
});

Deno.test('split people must match split_among when both are sent', () => {
  const resolved = resolveParticipantIdsForSplits(
    [ALICE, BOB],
    [{ participant_id: ALICE, amount: 100 }],
  );
  assertEquals(resolved.participantIds, []);
  assertEquals(typeof resolved.error, 'string');
});

Deno.test('omitted custom splits stay equal and pass the sum check', () => {
  const parsed = parseCustomSplits(undefined);
  assertEquals(parsed, { present: false });
  const shares = calculateEqualSplits(10, [ALICE, BOB]);
  assertEquals(validateSplitSum(shares, 10).valid, true);
});

Deno.test('scaling keeps an unequal ratio on amount edits', () => {
  assertEquals(
    scaleSplitsToTotal(
      [
        { participant_id: ALICE, amount: 75 },
        { participant_id: BOB, amount: 25 },
      ],
      200,
    ),
    [
      { participant_id: ALICE, amount: 150 },
      { participant_id: BOB, amount: 50 },
    ],
  );
});
