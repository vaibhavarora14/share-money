import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { Group } from "../types";
import {
  getGroupListSection,
  partitionGroupsBySection,
} from "./groupListSections.ts";

function makeGroup(overrides: Partial<Group> = {}): Group {
  return {
    id: "g1",
    name: "Test",
    created_by: "u1",
    created_at: "2026-01-01",
    updated_at: "2026-01-01",
    user_status: "active",
    archived_at: null,
    hidden_at: null,
    ...overrides,
  };
}

Deno.test("active membership without archive is active", () => {
  assertEquals(getGroupListSection(makeGroup()), "active");
});

Deno.test("archived active membership is archived", () => {
  assertEquals(
    getGroupListSection(makeGroup({ archived_at: "2026-09-15T00:00:00Z" })),
    "archived"
  );
});

Deno.test("left membership is former even if previously archived", () => {
  assertEquals(
    getGroupListSection(
      makeGroup({
        user_status: "left",
        archived_at: "2026-09-15T00:00:00Z",
      })
    ),
    "former"
  );
});

Deno.test("hidden membership is excluded", () => {
  assertEquals(
    getGroupListSection(makeGroup({ hidden_at: "2026-09-15T00:00:00Z" })),
    null
  );
});

Deno.test("partitionGroupsBySection splits buckets", () => {
  const groups = [
    makeGroup({ id: "a" }),
    makeGroup({ id: "b", archived_at: "2026-09-15T00:00:00Z" }),
    makeGroup({ id: "c", user_status: "left" }),
    makeGroup({ id: "d", hidden_at: "2026-09-15T00:00:00Z" }),
  ];
  const { activeGroups, archivedGroups, formerGroups } =
    partitionGroupsBySection(groups);
  assertEquals(activeGroups.map((g) => g.id), ["a"]);
  assertEquals(archivedGroups.map((g) => g.id), ["b"]);
  assertEquals(formerGroups.map((g) => g.id), ["c"]);
});
