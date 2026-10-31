import { z } from "zod";

export const AUTOMATION_GROUP_MAX_LENGTH = 64;

/**
 * Trim and collapse inner whitespace. Returns null for empty input, which
 * means "ungrouped". Case is kept: the group name is shown as typed.
 */
export function normalizeAutomationGroup(
	group: string | null | undefined,
): string | null {
	if (group == null) return null;
	const normalized = group.trim().replace(/\s+/g, " ");
	return normalized.length === 0 ? null : normalized;
}

/** The existing group that matches `group` without regard to case, else `group`. */
export function matchExistingAutomationGroup(
	group: string,
	existing: readonly string[],
): string {
	const lower = group.toLocaleLowerCase();
	return existing.find((name) => name.toLocaleLowerCase() === lower) ?? group;
}

export const automationGroupInputSchema = z
	.string()
	.transform(normalizeAutomationGroup)
	.pipe(z.string().max(AUTOMATION_GROUP_MAX_LENGTH).nullable())
	.nullable();
