import {
	MAX_CHANGES_RAIL_WIDTH,
	MIN_AGENT_AREA_WIDTH,
	MIN_CHANGES_RAIL_WIDTH,
} from "../../constants";

export function getChangesRailWidth({
	enabled,
	changedFileCount,
	containerWidth,
	preferredWidth,
}: {
	enabled: boolean;
	changedFileCount: number;
	containerWidth: number | null;
	preferredWidth: number;
}): { width: number; maxWidth: number } | null {
	if (!enabled || changedFileCount === 0 || containerWidth === null) {
		return null;
	}
	const maxWidth = Math.min(
		MAX_CHANGES_RAIL_WIDTH,
		containerWidth - MIN_AGENT_AREA_WIDTH,
	);
	if (maxWidth < MIN_CHANGES_RAIL_WIDTH) return null;
	return {
		width: Math.max(MIN_CHANGES_RAIL_WIDTH, Math.min(maxWidth, preferredWidth)),
		maxWidth,
	};
}
