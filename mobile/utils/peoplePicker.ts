export interface ExistingPerson {
  id: string;
  full_name: string;
  avatar_url?: string | null;
  source_group_id: string;
  source_group_name: string;
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
