import {
  type ExistingPerson,
  filterAndSortExistingPeople,
} from "../mobile/utils/peoplePicker.ts";

const people: ExistingPerson[] = [
  {
    id: "p-3",
    full_name: "Arya",
    source_group_id: "g-2",
    source_group_name: "Flat Expenses",
  },
  {
    id: "p-1",
    full_name: "Anuj",
    source_group_id: "g-1",
    source_group_name: "Goa Trip",
  },
  {
    id: "p-2",
    full_name: "Anuj",
    source_group_id: "g-3",
    source_group_name: "Weekend Plan",
  },
];

Deno.test("filters people by name and keeps duplicate names distinguishable by group", () => {
  const result = filterAndSortExistingPeople(people, "anuj");

  if (result.length !== 2) throw new Error("expected both Anuj entries");
  if (result[0].source_group_name !== "Goa Trip") {
    throw new Error("expected alphabetical order");
  }
  if (result[1].source_group_name !== "Weekend Plan") {
    throw new Error("expected group context");
  }
});

Deno.test("sorts the full directory by person name then group name", () => {
  const result = filterAndSortExistingPeople(people, "");

  const labels = result.map((person) =>
    `${person.full_name}:${person.source_group_name}`
  );
  const expected = ["Anuj:Goa Trip", "Anuj:Weekend Plan", "Arya:Flat Expenses"];
  if (labels.join("|") !== expected.join("|")) {
    throw new Error("unexpected sort order");
  }
});
