import type { SessionState } from "../../protocol/envelope";

export type ChatSelections = {
	modelId?: string;
	effortId?: string;
	modeId?: string;
};

export type SelectionCategory = "model" | "thought_level" | "mode";

const SELECTION_KEYS = {
	model: "modelId",
	thought_level: "effortId",
	mode: "modeId",
} as const satisfies Record<SelectionCategory, keyof ChatSelections>;

export const SELECTION_CATEGORIES = Object.keys(
	SELECTION_KEYS,
) as SelectionCategory[];

/** A plan mode is a step the user takes for one task, never where a chat starts. */
const NEVER_STARTING_MODES = new Set(["plan"]);

export function isStartingMode(modeId: string): boolean {
	return !NEVER_STARTING_MODES.has(modeId);
}

export function isSelectionCategory(
	category: string | undefined,
): category is SelectionCategory {
	return category !== undefined && Object.hasOwn(SELECTION_KEYS, category);
}

export function selectionKey(
	category: SelectionCategory,
): keyof ChatSelections {
	return SELECTION_KEYS[category];
}

function currentValue(
	session: SessionState,
	category: SelectionCategory,
): string | undefined {
	return session.configOptions?.find((option) => option.category === category)
		?.currentValue;
}

export function sessionSelections(
	session: SessionState | null | undefined,
): ChatSelections {
	if (!session) return {};
	const modelId = currentValue(session, "model") ?? session.modelId;
	const effortId = currentValue(session, "thought_level");
	const modeId = session.modeId;
	return {
		...(modelId ? { modelId } : {}),
		...(effortId ? { effortId } : {}),
		...(modeId ? { modeId } : {}),
	};
}
