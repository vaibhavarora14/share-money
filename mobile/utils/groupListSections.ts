import { Group } from "../types";

export type GroupListSection = "active" | "archived" | "former";

/**
 * Classify a group for the user's list sections.
 * Hidden memberships are excluded by the API and should not appear here.
 */
export function getGroupListSection(group: Group): GroupListSection | null {
  if (group.hidden_at) return null;
  if (group.user_status === "left") return "former";
  if (group.archived_at) return "archived";
  return "active";
}

export function partitionGroupsBySection(groups: Group[]): {
  activeGroups: Group[];
  archivedGroups: Group[];
  formerGroups: Group[];
} {
  const activeGroups: Group[] = [];
  const archivedGroups: Group[] = [];
  const formerGroups: Group[] = [];

  for (const group of groups) {
    const section = getGroupListSection(group);
    if (section === "active") activeGroups.push(group);
    else if (section === "archived") archivedGroups.push(group);
    else if (section === "former") formerGroups.push(group);
  }

  return { activeGroups, archivedGroups, formerGroups };
}
