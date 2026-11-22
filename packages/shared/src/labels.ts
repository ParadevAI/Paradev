export const LABEL_NAME_MAX_LENGTH = 64;
export const LABELS_MAX_PER_WORKSPACE = 32;
export const LABEL_PATH_SEPARATOR = "/";

export function normalizeLabelName(name: string): string | null {
	const normalized = name
		.split(LABEL_PATH_SEPARATOR)
		.map((segment) => segment.trim().toLowerCase())
		.filter(Boolean)
		.join(LABEL_PATH_SEPARATOR);
	if (normalized.length === 0 || normalized.length > LABEL_NAME_MAX_LENGTH) {
		return null;
	}
	return normalized;
}

/** `acme/web/api` → `["acme", "acme/web"]`. */
export function labelAncestorNames(name: string): string[] {
	const segments = name.split(LABEL_PATH_SEPARATOR);
	return segments
		.slice(0, -1)
		.map((_, index) => segments.slice(0, index + 1).join(LABEL_PATH_SEPARATOR));
}

export function labelParentName(name: string): string | null {
	return labelAncestorNames(name).at(-1) ?? null;
}

export function labelLeafName(name: string): string {
	return name.split(LABEL_PATH_SEPARATOR).at(-1) ?? name;
}

export function labelDepth(name: string): number {
	return labelAncestorNames(name).length;
}

/** Orders labels so each one follows its parent, siblings by name. */
export function sortLabelsAsTree<T extends { name: string }>(labels: T[]): T[] {
	return [...labels].sort((a, b) => {
		const left = a.name.split(LABEL_PATH_SEPARATOR);
		const right = b.name.split(LABEL_PATH_SEPARATOR);
		for (let i = 0; i < Math.min(left.length, right.length); i++) {
			const order = (left[i] ?? "").localeCompare(right[i] ?? "");
			if (order !== 0) return order;
		}
		return left.length - right.length;
	});
}
