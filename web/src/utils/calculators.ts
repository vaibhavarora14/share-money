export type BillSplitParticipant = {
  id: string;
  name: string;
  weight: string;
};

export type BillSplitInput = {
  subtotal: string;
  fees: string;
  tipPercent: string;
  currency: string;
  participants: BillSplitParticipant[];
};

export type BillSplitResult = {
  currency: string;
  subtotalMinor: number;
  feesMinor: number;
  tipMinor: number;
  totalMinor: number;
  shares: Array<{ id: string; name: string; amountMinor: number }>;
};

export type SettlementParticipant = {
  id: string;
  name: string;
  balance: string;
};

export type SettlementInput = {
  currency: string;
  participants: SettlementParticipant[];
};

export type SettlementTransfer = {
  from: string;
  to: string;
  amountMinor: number;
};

export type SettlementPlan = {
  currency: string;
  transfers: SettlementTransfer[];
};

const MAX_PARTICIPANTS = 20;
const MONEY_PATTERN = /^-?\d+(?:\.\d{1,2})?$/;
const NON_NEGATIVE_MONEY_PATTERN = /^\d+(?:\.\d{1,2})?$/;

function parseMinor(value: string, field: string, allowNegative = false): number {
  const normalized = value.trim();
  const pattern = allowNegative ? MONEY_PATTERN : NON_NEGATIVE_MONEY_PATTERN;

  if (!pattern.test(normalized)) {
    throw new Error(`${field} must use at most two decimal places.`);
  }

  const isNegative = normalized.startsWith("-");
  const unsigned = isNegative ? normalized.slice(1) : normalized;
  const [whole, fraction = ""] = unsigned.split(".");
  const minor = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));

  if (!Number.isSafeInteger(minor)) {
    throw new Error(`${field} is too large.`);
  }

  return isNegative ? -minor : minor;
}

function parseTipBasisPoints(value: string): number {
  const normalized = value.trim();
  if (!NON_NEGATIVE_MONEY_PATTERN.test(normalized)) {
    throw new Error("tip percentage must use at most two decimal places.");
  }

  const [whole, fraction = ""] = normalized.split(".");
  const basisPoints = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));

  if (!Number.isSafeInteger(basisPoints) || basisPoints > 100_000) {
    throw new Error("tip percentage must be between 0 and 1000.");
  }

  return basisPoints;
}

function validateCurrency(currency: string): string {
  const normalized = currency.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalized)) {
    throw new Error("currency must be a three-letter code.");
  }
  return normalized;
}

function validateParticipants<T extends { id: string; name: string }>(
  participants: T[],
): void {
  if (participants.length < 2 || participants.length > MAX_PARTICIPANTS) {
    throw new Error(`use between 2 and ${MAX_PARTICIPANTS} participants.`);
  }

  if (participants.some((participant) => !participant.id || !participant.name.trim())) {
    throw new Error("every participant needs a name.");
  }
}

function allocateMinorUnits(totalMinor: number, weights: number[]): number[] {
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  if (totalWeight <= 0) {
    throw new Error("participant weight must be greater than zero.");
  }

  const allocations = weights.map((weight, index) => {
    const raw = totalMinor * weight;
    return {
      index,
      amountMinor: Math.floor(raw / totalWeight),
      remainder: raw % totalWeight,
    };
  });
  let remainingMinor = totalMinor - allocations.reduce((sum, item) => sum + item.amountMinor, 0);

  [...allocations]
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index)
    .forEach((allocation) => {
      if (remainingMinor > 0) {
        allocations[allocation.index].amountMinor += 1;
        remainingMinor -= 1;
      }
    });

  return allocations.map((allocation) => allocation.amountMinor);
}

export function calculateBillSplit(input: BillSplitInput): BillSplitResult {
  validateParticipants(input.participants);
  const currency = validateCurrency(input.currency);
  const subtotalMinor = parseMinor(input.subtotal, "subtotal");
  const feesMinor = parseMinor(input.fees, "fees");
  const tipBasisPoints = parseTipBasisPoints(input.tipPercent);
  const tipMinor = Math.round((subtotalMinor * tipBasisPoints) / 10_000);
  const totalMinor = subtotalMinor + feesMinor + tipMinor;
  const weights = input.participants.map((participant) =>
    parseMinor(participant.weight, "participant weight"),
  );
  const allocations = allocateMinorUnits(totalMinor, weights);

  return {
    currency,
    subtotalMinor,
    feesMinor,
    tipMinor,
    totalMinor,
    shares: input.participants.map((participant, index) => ({
      id: participant.id,
      name: participant.name.trim(),
      amountMinor: allocations[index],
    })),
  };
}

export function calculateSettlementPlan(input: SettlementInput): SettlementPlan {
  validateParticipants(input.participants);
  const currency = validateCurrency(input.currency);
  const balances = input.participants.map((participant) => ({
    name: participant.name.trim(),
    amountMinor: parseMinor(participant.balance, "balance", true),
  }));
  const totalMinor = balances.reduce((sum, participant) => sum + participant.amountMinor, 0);

  if (totalMinor !== 0) {
    throw new Error("balances must sum to zero.");
  }

  const debtors = [...balances
    .filter((participant) => participant.amountMinor < 0)
    .map((participant) => ({ ...participant }))]
    .sort((a, b) => a.amountMinor - b.amountMinor);
  const creditors = [...balances
    .filter((participant) => participant.amountMinor > 0)
    .map((participant) => ({ ...participant }))]
    .sort((a, b) => b.amountMinor - a.amountMinor);
  const transfers: SettlementTransfer[] = [];

  let debtorIndex = 0;
  let creditorIndex = 0;

  while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
    const debtor = debtors[debtorIndex];
    const creditor = creditors[creditorIndex];
    const amountMinor = Math.min(Math.abs(debtor.amountMinor), creditor.amountMinor);

    transfers.push({ from: debtor.name, to: creditor.name, amountMinor });
    debtor.amountMinor += amountMinor;
    creditor.amountMinor -= amountMinor;

    if (debtor.amountMinor === 0) debtorIndex += 1;
    if (creditor.amountMinor === 0) creditorIndex += 1;
  }

  return { currency, transfers };
}
