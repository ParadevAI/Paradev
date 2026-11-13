import type {
	SessionConfigOption,
	SessionState,
} from "../../protocol/envelope";

export type ChatSelections = {
	modelId?: string;
	effortId?: string;
	modeId?: string;
	fast?: string;
};

export type SelectionCategory = "model" | "thought_level" | "mode" | "fast";

const SELECTION_KEYS = {
	model: "modelId",
	thought_level: "effortId",
	mode: "modeId",
	fast: "fast",
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

/** Claude lists fast mode as `fast` with no category, Codex as `fast-mode`. */
const FAST_OPTION_IDS = new Set(["fast", "fast-mode"]);

export function isFastOption(option: SessionConfigOption): boolean {
	return (
		FAST_OPTION_IDS.has(option.id) &&
		option.options.length === 2 &&
		option.options.some((entry) => entry.id === "on") &&
		option.options.some((entry) => entry.id === "off")
	);
}

export function selectionCategoryOf(
	option: SessionConfigOption,
): SelectionCategory | undefined {
	if (isFastOption(option)) return "fast";
	return option.category !== "fast" && isSelectionCategory(option.category)
		? option.category
		: undefined;
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
	return session.configOptions?.find(
		(option) => selectionCategoryOf(option) === category,
	)?.currentValue;
}

export function sessionSelections(
	session: SessionState | null | undefined,
): ChatSelections {
	if (!session) return {};
	const modelId = currentValue(session, "model") ?? session.modelId;
	const effortId = currentValue(session, "thought_level");
	const modeId = session.modeId;
	const fast = currentValue(session, "fast");
	return {
		...(modelId ? { modelId } : {}),
		...(effortId ? { effortId } : {}),
		...(modeId ? { modeId } : {}),
		...(fast ? { fast } : {}),
	};
}
