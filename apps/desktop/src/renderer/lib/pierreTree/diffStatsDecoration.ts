import type { FileTreeRowDecoration } from "@pierre/trees";
import { formatDiffStats } from "./formatDiffStats";

const ADDITION_COLOR = "var(--color-green-400)";
const DELETION_COLOR = "var(--color-red-400)";

/** The `+N −M` row decoration, colored like `DiffStatText`. */
export function diffStatsDecoration(
	additions: number | null,
	deletions: number | null,
): Extract<FileTreeRowDecoration, { text: string }> | null {
	const text = formatDiffStats(additions, deletions);
	if (!text || additions === null || deletions === null) return null;
	const parts: { text: string; color: string }[] = [];
	if (additions > 0)
		parts.push({ text: `+${additions}`, color: ADDITION_COLOR });
	// Pierre lays parts out as flex items, which collapse a plain space.
	if (additions > 0 && deletions > 0) parts.push({ text: "\u00a0", color: "" });
	if (deletions > 0)
		parts.push({ text: `−${deletions}`, color: DELETION_COLOR });
	return { text, parts };
}
