export interface KeptTabEntry {
	tabId: string;
	shownAt: number;
}

/**
 * The tabs that stay mounted, in the order they were first kept: the active
 * tab and the `maxHidden` most recently shown others. Returns `previous`
 * unchanged when nothing moved, so it can feed a state setter directly.
 */
export function nextKeptTabs({
	previous,
	activeTabId,
	isKeepable,
	maxHidden,
}: {
	previous: readonly KeptTabEntry[];
	activeTabId: string | null;
	isKeepable: (tabId: string) => boolean;
	maxHidden: number;
}): readonly KeptTabEntry[] {
	let next = previous.filter((kept) => isKeepable(kept.tabId));

	if (activeTabId !== null && isKeepable(activeTabId)) {
		const latest = next.reduce((max, kept) => Math.max(max, kept.shownAt), 0);
		const current = next.find((kept) => kept.tabId === activeTabId);
		if (!current) {
			next = [...next, { tabId: activeTabId, shownAt: latest + 1 }];
		} else if (current.shownAt !== latest) {
			next = next.map((kept) =>
				kept === current ? { tabId: activeTabId, shownAt: latest + 1 } : kept,
			);
		}
	}

	const hidden = next.filter((kept) => kept.tabId !== activeTabId);
	if (hidden.length > maxHidden) {
		const evicted = new Set(
			[...hidden]
				.sort((a, b) => a.shownAt - b.shownAt)
				.slice(0, hidden.length - Math.max(0, maxHidden))
				.map((kept) => kept.tabId),
		);
		next = next.filter((kept) => !evicted.has(kept.tabId));
	}

	return sameKeptTabs(previous, next) ? previous : next;
}

function sameKeptTabs(
	a: readonly KeptTabEntry[],
	b: readonly KeptTabEntry[],
): boolean {
	return (
		a.length === b.length &&
		a.every(
			(kept, i) => kept.tabId === b[i]?.tabId && kept.shownAt === b[i]?.shownAt,
		)
	);
}
