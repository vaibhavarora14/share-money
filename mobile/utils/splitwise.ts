import { Participant } from "../types";
import { parseCsv } from "./csv";

/**
 * Parser for Splitwise group exports ("Export as spreadsheet" CSV).
 *
 * The export has fixed columns followed by one column per group member:
 *
 *   Date,Description,Category,Cost,Currency,Alice,Bob,Charlie
 *   2024-05-01,Groceries,Groceries,6000.00,INR,4000.00,-2000.00,-2000.00
 *   2024-05-03,Bob paid Alice,Payment,1500.00,INR,-1500.00,1500.00,0.00
 *   ,Total balance,,,INR,2500.00,-500.00,-2000.00
 *
 * Each member cell holds the row's net effect on that member's balance
 * (paid minus owed share): positive means they lent money, negative means
 * they borrowed. From a single-payer expense row we can reconstruct exact
 * shares: the payer is the one positive column, every negative column is
 * that member's share, and the payer's own share is the remainder of the
 * cost. Rows with category "Payment" are settle-ups: the positive column
 * paid the negative column.
 */

// Matches the server-side cap in the import-splitwise edge function
const MAX_AMOUNT = 1000000;
export const MAX_SPLITWISE_IMPORT_ITEMS = 2_000;

const FIXED_COLUMNS = ["date", "description", "category", "cost", "currency"];

/** Amounts smaller than this are treated as zero (guards float dust). */
const EPSILON = 0.005;

export interface SplitwiseExpenseRow {
  /** 1-based line number in the CSV, for error reporting */
  line: number;
  description: string;
  date: string; // YYYY-MM-DD
  category: string | null;
  currency: string;
  amount: number;
  /** Index into SplitwiseParseResult.people */
  payerIndex: number;
  /** Positive shares only; indexes into SplitwiseParseResult.people */
  shares: { personIndex: number; amount: number }[];
}

export interface SplitwisePaymentRow {
  line: number;
  description: string;
  date: string;
  currency: string;
  amount: number;
  fromIndex: number;
  toIndex: number;
}

export interface SplitwiseSkippedRow {
  line: number;
  description: string;
  reason: string;
}

export interface SplitwiseParseResult {
  /** Member names taken from the CSV header, in column order */
  people: string[];
  expenses: SplitwiseExpenseRow[];
  payments: SplitwisePaymentRow[];
  skipped: SplitwiseSkippedRow[];
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function parseAmount(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return 0;
  // Splitwise uses plain "1234.56" / "-1234.56" formatting
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/**
 * Parses a Splitwise CSV export.
 *
 * Throws an Error with a user-facing message when the file structurally is
 * not a Splitwise export. Individual rows that cannot be represented are
 * collected in `skipped` with a reason instead of failing the whole file.
 */
export function parseSplitwiseExport(csvText: string): SplitwiseParseResult {
  const rows = parseCsv(csvText).filter(
    (row) => !(row.length === 1 && row[0].trim() === "")
  );

  if (rows.length === 0) {
    throw new Error("The file is empty.");
  }

  const header = rows[0].map((cell) => cell.trim());
  const headerMatches =
    header.length > FIXED_COLUMNS.length &&
    FIXED_COLUMNS.every(
      (expected, index) => header[index].toLowerCase() === expected
    );

  if (!headerMatches) {
    throw new Error(
      'This does not look like a Splitwise export. Expected columns: "Date, Description, Category, Cost, Currency" followed by member names.'
    );
  }

  const people = header.slice(FIXED_COLUMNS.length);
  if (people.length < 2) {
    throw new Error(
      "The export needs at least 2 members to have anything to split."
    );
  }
  if (people.some((name) => name.length === 0)) {
    throw new Error("The export has member columns without names.");
  }

  const result: SplitwiseParseResult = {
    people,
    expenses: [],
    payments: [],
    skipped: [],
  };

  for (let rowIndex = 1; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex].map((cell) => cell.trim());
    const line = rowIndex + 1;

    const date = row[0] ?? "";
    const description = row[1] ?? "";
    const category = row[2] ?? "";
    const costRaw = row[3] ?? "";
    const currency = (row[4] ?? "").toUpperCase();

    const skip = (reason: string) => {
      result.skipped.push({
        line,
        description: description || "(no description)",
        reason,
      });
    };

    // Splitwise appends a "Total balance" summary row (sometimes dated,
    // sometimes not, but always without a cost).
    if (description.toLowerCase() === "total balance" && costRaw.length === 0) {
      continue;
    }

    if (row.every((cell) => cell.length === 0)) {
      continue;
    }

    if (!isIsoDate(date)) {
      skip("has a date we couldn't read");
      continue;
    }

    if (description.length === 0) {
      skip("has no description");
      continue;
    }

    if (!/^[A-Z]{3}$/.test(currency)) {
      skip("has no valid currency code");
      continue;
    }

    const cost = parseAmount(costRaw);
    if (cost === null) {
      skip("has an amount we couldn't read");
      continue;
    }
    if (cost <= EPSILON) {
      skip("has a zero amount");
      continue;
    }
    if (cost > MAX_AMOUNT) {
      skip(`is larger than the ${MAX_AMOUNT.toLocaleString("en-US")} import limit`);
      continue;
    }

    const nets: number[] = [];
    let netsValid = true;
    for (let p = 0; p < people.length; p++) {
      const net = parseAmount(row[FIXED_COLUMNS.length + p] ?? "");
      if (net === null) {
        netsValid = false;
        break;
      }
      nets.push(round2(net));
    }
    if (!netsValid) {
      skip("has member amounts we couldn't read");
      continue;
    }

    const netSum = nets.reduce((acc, net) => acc + net, 0);
    if (Math.abs(netSum) > 0.02) {
      skip("has member amounts that don't balance out");
      continue;
    }

    const positiveIndexes = nets
      .map((net, index) => ({ net, index }))
      .filter(({ net }) => net > EPSILON);
    const negativeIndexes = nets
      .map((net, index) => ({ net, index }))
      .filter(({ net }) => net < -EPSILON);

    if (positiveIndexes.length === 0 || negativeIndexes.length === 0) {
      skip("doesn't affect anyone's balance");
      continue;
    }

    const isPayment = category.toLowerCase() === "payment";

    if (isPayment) {
      if (positiveIndexes.length !== 1 || negativeIndexes.length !== 1) {
        skip("is a payment between more than two people");
        continue;
      }
      // In payment rows the person who paid has the positive net (their
      // balance goes up because their debt shrinks).
      result.payments.push({
        line,
        description,
        date,
        currency,
        amount: round2(cost),
        fromIndex: positiveIndexes[0].index,
        toIndex: negativeIndexes[0].index,
      });
      continue;
    }

    if (positiveIndexes.length > 1) {
      skip("was paid by multiple people, which isn't supported");
      continue;
    }

    const payerIndex = positiveIndexes[0].index;

    // Everyone with a negative net owes exactly that much; the payer's own
    // share is whatever remains of the cost so the shares always add up.
    const shares: { personIndex: number; amount: number }[] = [];
    let nonPayerTotal = 0;
    for (const { net, index } of negativeIndexes) {
      const share = round2(-net);
      shares.push({ personIndex: index, amount: share });
      nonPayerTotal = round2(nonPayerTotal + share);
    }

    const payerShare = round2(cost - nonPayerTotal);
    if (payerShare < -EPSILON) {
      skip("has shares that exceed the total amount");
      continue;
    }
    if (payerShare > EPSILON) {
      shares.push({ personIndex: payerIndex, amount: payerShare });
    }

    result.expenses.push({
      line,
      description,
      date,
      category: category.length > 0 ? category.slice(0, 50) : null,
      currency,
      amount: round2(cost),
      payerIndex,
      shares,
    });
  }

  const importableItemCount = result.expenses.length + result.payments.length;
  if (importableItemCount > MAX_SPLITWISE_IMPORT_ITEMS) {
    throw new Error(
      `This file has ${importableItemCount.toLocaleString("en-US")} importable items. Imports support up to ${MAX_SPLITWISE_IMPORT_ITEMS.toLocaleString("en-US")} items at a time.`,
    );
  }

  return result;
}

function normalizeName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function firstName(value: string): string {
  return normalizeName(value).split(" ")[0] ?? "";
}

function participantNames(participant: Participant): string[] {
  const names: string[] = [];
  if (participant.full_name) names.push(normalizeName(participant.full_name));
  if (participant.email) {
    names.push(normalizeName(participant.email.split("@")[0]));
  }
  return names;
}

/**
 * Suggests a participant for each Splitwise member name.
 *
 * Matches by full name first, then by unique first name / email prefix.
 * Each participant is suggested at most once; unmatched people map to null
 * and must be assigned manually.
 */
export function autoMatchPeopleToParticipants(
  people: string[],
  participants: Participant[]
): (string | null)[] {
  const assigned = new Set<string>();
  const matches: (string | null)[] = people.map(() => null);

  // Pass 1: exact full-name or email-prefix match
  people.forEach((person, personIndex) => {
    const target = normalizeName(person);
    const candidates = participants.filter(
      (participant) =>
        !assigned.has(participant.id) &&
        participantNames(participant).includes(target)
    );
    if (candidates.length === 1) {
      matches[personIndex] = candidates[0].id;
      assigned.add(candidates[0].id);
    }
  });

  // Pass 2: unique first-name match (Splitwise headers are often first names)
  people.forEach((person, personIndex) => {
    if (matches[personIndex]) return;
    const target = firstName(person);
    if (target.length === 0) return;
    const candidates = participants.filter(
      (participant) =>
        !assigned.has(participant.id) &&
        participantNames(participant).some(
          (name) => name.split(" ")[0] === target
        )
    );
    if (candidates.length === 1) {
      matches[personIndex] = candidates[0].id;
      assigned.add(candidates[0].id);
    }
  });

  return matches;
}
