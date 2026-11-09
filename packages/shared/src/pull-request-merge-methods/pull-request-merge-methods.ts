export type MergeMethod = "merge" | "squash" | "rebase";

/** The order GitHub's own merge menu lists them in. */
export const GITHUB_MERGE_METHOD_ORDER: readonly MergeMethod[] = [
	"merge",
	"squash",
	"rebase",
];

const UNKNOWN_SETTINGS_ORDER: readonly MergeMethod[] = [
	"squash",
	"merge",
	"rebase",
];

export interface RepositoryMergeSettings {
	allowedMergeMethods?: readonly string[] | null;
	/** Absent from API and host-service builds older than this field. */
	defaultMergeMethod?: string | null;
}

export interface MergeMethodChoices {
	/** What the merge menu offers, in GitHub's order. */
	methods: MergeMethod[];
	/** What the main Merge button does. */
	primary: MergeMethod;
}

function isMergeMethod(value: unknown): value is MergeMethod {
	return value === "merge" || value === "squash" || value === "rebase";
}

/**
 * The merge methods to offer for a repository, and the one the main button
 * uses. Without settings, every method is offered and squash is primary.
 */
export function mergeMethodChoices(
	settings: RepositoryMergeSettings | null | undefined,
): MergeMethodChoices {
	const allowed = new Set(
		(settings?.allowedMergeMethods ?? []).filter(isMergeMethod),
	);
	if (allowed.size === 0) {
		return { methods: [...UNKNOWN_SETTINGS_ORDER], primary: "squash" };
	}
	const methods = GITHUB_MERGE_METHOD_ORDER.filter((method) =>
		allowed.has(method),
	);
	const preferred = settings?.defaultMergeMethod;
	const primary =
		isMergeMethod(preferred) && allowed.has(preferred)
			? preferred
			: allowed.has("squash")
				? "squash"
				: (methods[0] as MergeMethod);
	return { methods, primary };
}
