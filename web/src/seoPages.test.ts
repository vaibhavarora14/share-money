import { describe, expect, it } from "vitest";
import { normalizeSeoPath, pageByPath, relatedPages, seoPages } from "./seoPages";

describe("SEO route content", () => {
  it("has unique, indexable routes without a fixed page-count limit", () => {
    expect(seoPages.length).toBeGreaterThan(0);
    expect(new Set(seoPages.map((page) => page.path)).size).toBe(seoPages.length);
    expect(pageByPath.get("/guides/import-from-splitwise")).toBeDefined();
  });

  it("only resolves known paths and maintains related-page links", () => {
    const splitBills = pageByPath.get("/split-bills");

    expect(normalizeSeoPath("/tools/split-bill-calculator/")).toBe("/tools/split-bill-calculator");
    expect(normalizeSeoPath("/not-a-real-route")).toBeNull();
    expect(splitBills).toBeDefined();
    expect(relatedPages(splitBills!).map((page) => page.id)).toEqual([
      "split-bill-calculator",
      "group-expense-tracker",
      "roommate-expense-tracker",
    ]);
  });
});
