export interface AutomationGroupSection<T> {
	/** Null holds the automations in no group. */
	group: string | null;
	items: T[];
}

const compareGroups = (a: string, b: string) =>
	a.localeCompare(b, undefined, { sensitivity: "base", numeric: true });

/** Distinct group names, sorted. */
export function listAutomationGroups(
	automations: readonly { group: string | null }[],
): string[] {
	const groups = new Set<string>();
	for (const automation of automations) {
		if (automation.group) groups.add(automation.group);
	}
	return [...groups].sort(compareGroups);
}

/**
 * Splits automations into sections by group, keeping their order inside each
 * section. Named groups are sorted; the ungrouped section comes last.
 */
export function groupAutomations<T extends { group: string | null }>(
	automations: readonly T[],
): AutomationGroupSection<T>[] {
	const byGroup = new Map<string | null, T[]>();
	for (const automation of automations) {
		const key = automation.group || null;
		const items = byGroup.get(key);
		if (items) items.push(automation);
		else byGroup.set(key, [automation]);
	}
	const named = [...byGroup.keys()]
		.filter((group): group is string => group !== null)
		.sort(compareGroups)
		.map((group) => ({ group, items: byGroup.get(group) ?? [] }));
	const ungrouped = byGroup.get(null);
	return ungrouped ? [...named, { group: null, items: ungrouped }] : named;
}
