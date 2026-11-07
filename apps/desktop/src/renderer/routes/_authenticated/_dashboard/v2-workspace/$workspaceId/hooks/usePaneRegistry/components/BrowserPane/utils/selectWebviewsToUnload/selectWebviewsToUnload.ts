export interface UnloadCandidate {
	paneId: string;
	lastUsedAt: number;
	memoryKb: number;
	/** A page that plays audio, holds unsaved form input, or has an agent attached. */
	keepLoaded: boolean;
}

export interface UnloadPolicy {
	now: number;
	budgetKb: number;
	/** The newest pages that stay loaded even over budget. */
	minLoaded: number;
	maxLoaded: number;
	idleMs: number;
}

/** Hidden pages to unload, oldest first: idle ones, then the oldest until the rest fit the budget. */
export function selectWebviewsToUnload(
	hidden: UnloadCandidate[],
	policy: UnloadPolicy,
): string[] {
	const oldestFirst = hidden
		.filter((candidate) => !candidate.keepLoaded)
		.sort((a, b) => a.lastUsedAt - b.lastUsedAt);
	let totalKb = hidden.reduce((sum, candidate) => sum + candidate.memoryKb, 0);
	let loaded = hidden.length;
	const unload: string[] = [];
	for (const [index, candidate] of oldestFirst.entries()) {
		const idle = policy.now - candidate.lastUsedAt > policy.idleMs;
		const over = totalKb > policy.budgetKb || loaded > policy.maxLoaded;
		const newerEvictable = oldestFirst.length - index - 1;
		if (!idle && !(over && newerEvictable >= policy.minLoaded)) continue;
		unload.push(candidate.paneId);
		totalKb -= candidate.memoryKb;
		loaded -= 1;
	}
	return unload;
}
