import { lowerLabel } from "../task-views/task-views.ts";

const PALETTE = [
	"#d4574a",
	"#c9822a",
	"#a8933a",
	"#4f9a63",
	"#3f95a0",
	"#4f7bd0",
	"#8a63c9",
	"#c4568f",
];

/** A label's dot colour: the same name always gets the same one (any case), spread over a fixed palette. */
export function labelColor(name: string): string {
	let hash = 0;
	for (const ch of name.trim().toLowerCase())
		hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
	return PALETTE[hash % PALETTE.length]!;
}

/**
 * The label picker's order as it opens, Linear's: the task's labels first, then the rest as given (most used first).
 * Keep it for as long as the picker is open and lay the rows out with `inOrder`, so a tick doesn't move a row.
 */
export function chosenFirst<T extends { name: string }>(
	known: T[],
	chosen: string[],
): T[] {
	const on = new Set(chosen.map(lowerLabel));
	return [
		...known.filter((l) => on.has(lowerLabel(l.name))),
		...known.filter((l) => !on.has(lowerLabel(l.name))),
	];
}

/**
 * Labels laid out in an order kept from earlier (any case), so a count that changes doesn't move a row; names the
 * order doesn't know (one just created) come after, as given.
 */
export function inOrder<T extends { name: string }>(
	known: T[],
	order: string[],
): T[] {
	const at = new Map(order.map((name, i) => [lowerLabel(name), i]));
	const rank = (l: T) => at.get(lowerLabel(l.name)) ?? order.length;
	return known
		.map((l, i) => ({ l, i }))
		.sort((a, b) => rank(a.l) - rank(b.l) || a.i - b.i)
		.map(({ l }) => l);
}
