export interface ExistingPerson {
  id: string;
  full_name: string;
  email?: string | null;
  avatar_url?: string | null;
  user_id?: string | null;
  source_group_id?: string;
  source_group_name?: string;
}

interface RemovablePerson {
  id: string;
  type: "member" | "invited" | "former";
  user_id?: string | null;
}

/** An unlinked, non-invited person can be removed by a member who manages people. */
export function canRemovePerson(
  person: RemovablePerson,
  options: { canManageMembers: boolean; currentUserId?: string },
): boolean {
  if (person.type !== "member") return false;
  if (!person.user_id) return options.canManageMembers;
  return options.canManageMembers || person.user_id === options.currentUserId;
}

function normalizeEmail(email?: string | null): string {
  return (email ?? "").trim().toLocaleLowerCase();
}

function normalizeName(name: string): string {
  return name.trim().toLocaleLowerCase();
}

function identityKey(person: ExistingPerson): string {
  if (person.user_id) return `user:${person.user_id}`;
  const email = normalizeEmail(person.email);
  if (email) return `email:${email}`;
  return `name:${normalizeName(person.full_name)}`;
}

function richness(person: ExistingPerson): number {
  return (person.user_id ? 2 : 0) + (normalizeEmail(person.email) ? 1 : 0);
}

/**
 * One row per person: same account, same email, or the same name-only
 * placeholder must not appear twice.
 */
export function dedupeExistingPeople(
  people: ExistingPerson[],
): ExistingPerson[] {
  const chosen = new Map<string, ExistingPerson>();

  for (const person of people) {
    if (!person.full_name.trim()) continue;
    const key = identityKey(person);
    const existing = chosen.get(key);
    if (!existing || richness(person) > richness(existing)) {
      chosen.set(key, person);
    }
  }

  return Array.from(chosen.values());
}

/**
 * Search by name or email and sort the unique directory.
 */
export function filterAndSortExistingPeople(
  people: ExistingPerson[],
  search: string,
): ExistingPerson[] {
  const normalizedSearch = search.trim().toLocaleLowerCase();

  return dedupeExistingPeople(people)
    .filter((person) =>
      !normalizedSearch ||
      person.full_name.toLocaleLowerCase().includes(normalizedSearch) ||
      normalizeEmail(person.email).includes(normalizedSearch)
    )
    .sort((left, right) => {
      const nameOrder = left.full_name.localeCompare(right.full_name);
      return nameOrder !== 0
        ? nameOrder
        : normalizeEmail(left.email).localeCompare(normalizeEmail(right.email));
    });
}
