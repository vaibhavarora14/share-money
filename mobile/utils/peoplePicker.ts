export interface ExistingPerson {
  id: string;
  full_name: string;
  avatar_url?: string | null;
  source_group_id: string;
  source_group_name: string;
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

/**
 * Keeps duplicate names visible by sorting their group context rather than
 * collapsing them into a single match.
 */
export function filterAndSortExistingPeople(
  people: ExistingPerson[],
  search: string,
): ExistingPerson[] {
  const normalizedSearch = search.trim().toLocaleLowerCase();

  return people
    .filter((person) =>
      !normalizedSearch ||
      person.full_name.toLocaleLowerCase().includes(normalizedSearch) ||
      person.source_group_name.toLocaleLowerCase().includes(normalizedSearch)
    )
    .sort((left, right) => {
      const nameOrder = left.full_name.localeCompare(right.full_name);
      return nameOrder !== 0
        ? nameOrder
        : left.source_group_name.localeCompare(right.source_group_name);
    });
}
