import { describe, expect, it } from "vitest";
import {
  calculateBillSplit,
  calculateSettlementPlan,
} from "./calculators";

describe("calculateBillSplit", () => {
  it("splits a bill, tax, and tip into exact equal shares", () => {
    const result = calculateBillSplit({
      subtotal: "100.00",
      fees: "5.00",
      tipPercent: "10",
      currency: "USD",
      participants: [
        { id: "alex", name: "Alex", weight: "1" },
        { id: "blair", name: "Blair", weight: "1" },
        { id: "casey", name: "Casey", weight: "1" },
      ],
    });

    expect(result.totalMinor).toBe(11500);
    expect(result.shares.map((share) => share.amountMinor)).toEqual([3834, 3833, 3833]);
    expect(result.shares.reduce((sum, share) => sum + share.amountMinor, 0)).toBe(
      result.totalMinor,
    );
  });

  it("uses participant weights to distribute fractional remainder fairly", () => {
    const result = calculateBillSplit({
      subtotal: "10.00",
      fees: "0",
      tipPercent: "0",
      currency: "USD",
      participants: [
        { id: "alex", name: "Alex", weight: "1" },
        { id: "blair", name: "Blair", weight: "2" },
        { id: "casey", name: "Casey", weight: "3" },
      ],
    });

    expect(result.shares.map((share) => share.amountMinor)).toEqual([167, 333, 500]);
  });

  it("rejects invalid amounts and unusable participant weights", () => {
    expect(() =>
      calculateBillSplit({
        subtotal: "-1",
        fees: "0",
        tipPercent: "0",
        currency: "USD",
        participants: [
          { id: "alex", name: "Alex", weight: "1" },
          { id: "blair", name: "Blair", weight: "1" },
        ],
      }),
    ).toThrow("subtotal");

    expect(() =>
      calculateBillSplit({
        subtotal: "10",
        fees: "0",
        tipPercent: "0",
        currency: "USD",
        participants: [
          { id: "alex", name: "Alex", weight: "0" },
          { id: "blair", name: "Blair", weight: "0" },
        ],
      }),
    ).toThrow("weight");
  });
});

describe("calculateSettlementPlan", () => {
  it("matches debtors with creditors and reconciles every balance", () => {
    const result = calculateSettlementPlan({
      currency: "USD",
      participants: [
        { id: "alex", name: "Alex", balance: "50.00" },
        { id: "blair", name: "Blair", balance: "-20.00" },
        { id: "casey", name: "Casey", balance: "-30.00" },
      ],
    });

    expect(result.transfers).toEqual([
      { from: "Casey", to: "Alex", amountMinor: 3000 },
      { from: "Blair", to: "Alex", amountMinor: 2000 },
    ]);
  });

  it("rejects a plan whose balances do not reconcile", () => {
    expect(() =>
      calculateSettlementPlan({
        currency: "USD",
        participants: [
          { id: "alex", name: "Alex", balance: "20.00" },
          { id: "blair", name: "Blair", balance: "-10.00" },
        ],
      }),
    ).toThrow("sum to zero");
  });
});
