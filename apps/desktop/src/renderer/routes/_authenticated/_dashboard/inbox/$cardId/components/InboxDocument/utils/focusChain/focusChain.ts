export interface FocusUnit {
	kind: "card" | "question";
	id: string;
}

interface ChainBlock {
	id: string;
	type: string;
	actionable?: boolean;
	ask?: { questions: { id: string }[] };
}

interface Settled {
	blocks: Record<string, unknown>;
	answers: Record<string, unknown>;
	skipped: string[];
}

export function unitKey(unit: FocusUnit): string {
	return `${unit.kind}:${unit.id}`;
}

/** What can hold focus on a card, in reading order: each integration card that waits on the reader, and each question. */
export function focusUnits(blocks: ChainBlock[]): FocusUnit[] {
	return blocks.flatMap((block): FocusUnit[] => {
		if (block.type === "card")
			return block.actionable ? [{ kind: "card", id: block.id }] : [];
		if (block.type === "ask")
			return (block.ask?.questions ?? []).map((question) => ({
				kind: "question",
				id: question.id,
			}));
		return [];
	});
}

function isSettled(unit: FocusUnit, settled: Settled): boolean {
	return unit.kind === "card"
		? unit.id in settled.blocks
		: unit.id in settled.answers || settled.skipped.includes(unit.id);
}

export function firstUnsettled(
	units: FocusUnit[],
	settled: Settled,
): string | null {
	const unit = units.find((candidate) => !isSettled(candidate, settled));
	return unit ? unitKey(unit) : null;
}

/** Where focus goes once the focused block settles: the next open one below it, else the first open one above. */
export function focusAfter(
	units: FocusUnit[],
	settled: Settled,
	current: string | null,
): string | null {
	const index = units.findIndex((unit) => unitKey(unit) === current);
	const below = units
		.slice(index + 1)
		.find((unit) => !isSettled(unit, settled));
	return below ? unitKey(below) : firstUnsettled(units, settled);
}

/** The block that has focus: the one asked for while it is open, else where focus goes after it. */
export function resolveFocus(
	units: FocusUnit[],
	settled: Settled,
	wanted: string | null,
): string | null {
	const unit = units.find((candidate) => unitKey(candidate) === wanted);
	if (unit && !isSettled(unit, settled)) return wanted;
	return focusAfter(units, settled, wanted);
}

/** One open block down or up from the focused one. The ends do not wrap. */
export function stepFocus(
	units: FocusUnit[],
	settled: Settled,
	current: string | null,
	step: 1 | -1,
): string | null {
	const open = units.filter((unit) => !isSettled(unit, settled)).map(unitKey);
	if (open.length === 0) return null;
	const index = current === null ? -1 : open.indexOf(current);
	if (index === -1) return step === 1 ? open[0] : open[open.length - 1];
	return open[Math.min(open.length - 1, Math.max(0, index + step))];
}
