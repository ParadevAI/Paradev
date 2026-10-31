import type { ToolCall, ToolContent, ToolKind } from "@superset/chat/protocol";
import { type DiffStats, diffStats } from "../diffStats";
import { type FileChangeKind, fileChangeKind } from "../fileChange";

type DiffToolContent = Extract<ToolContent, { type: "diff" }>;

export type TurnFileChange = {
	/** The path as the agent first reported it. */
	path: string;
	kind: FileChangeKind;
	/** Null while a call's body is not loaded, or its diff is too large to count. */
	stats: DiffStats | null;
	/** The first changed line, where the agent reported one. */
	line?: number;
};

type Tally = Omit<TurnFileChange, "kind"> & {
	kind: FileChangeKind | "gone";
};

const FILE_TOOL_KINDS = new Set<ToolKind>(["edit", "delete", "move"]);

const statsByDiff = new WeakMap<DiffToolContent, DiffStats | null>();

function countedStats(diff: DiffToolContent): DiffStats | null {
	if (!statsByDiff.has(diff)) statsByDiff.set(diff, diffStats(diff));
	return statsByDiff.get(diff) ?? null;
}

function diffsOf(call: ToolCall): DiffToolContent[] {
	return call.content.filter(
		(content): content is DiffToolContent => content.type === "diff",
	);
}

/** A reopened chat loads calls without bodies; their locations still name the files. */
function locatedOnly(call: ToolCall): boolean {
	return (
		call.bodyOmitted === true &&
		FILE_TOOL_KINDS.has(call.toolKind) &&
		(call.locations?.length ?? 0) > 0
	);
}

export function changesFiles(call: ToolCall): boolean {
	if (call.status !== "completed") return false;
	return diffsOf(call).length > 0 || locatedOnly(call);
}

function textLines(text: string): string[] {
	const lines = text.split("\n");
	if (lines.at(-1) === "") lines.pop();
	return lines;
}

function leadingContextLines(diff: DiffToolContent): number {
	if (diff.oldText === null) return 0;
	const before = textLines(diff.oldText);
	const after = textLines(diff.newText);
	let same = 0;
	while (
		same < before.length &&
		same < after.length &&
		before[same] === after[same]
	) {
		same++;
	}
	return same === before.length && same === after.length ? 0 : same;
}

/**
 * A location gives the line a hunk starts on, context included. When a call
 * reports one location per hunk, the hunk's own context says where the change
 * itself starts.
 */
function firstChangeLine(
	call: ToolCall,
	path: string,
	diffs: readonly DiffToolContent[],
): number | undefined {
	const lines = (call.locations ?? []).flatMap((location) =>
		location.path === path && location.line !== undefined
			? [location.line]
			: [],
	);
	if (lines.length === 0) return undefined;
	if (lines.length !== diffs.length) return Math.min(...lines);
	return Math.min(
		...lines.map((line, index) => {
			const diff = diffs[index];
			return diff ? line + leadingContextLines(diff) : line;
		}),
	);
}

function callKind(
	diffs: readonly DiffToolContent[],
	toolKind: ToolKind,
): FileChangeKind {
	const kinds = diffs.map((diff) => fileChangeKind(diff, toolKind));
	if (kinds.includes("deleted")) return "deleted";
	return kinds.every((kind) => kind === "added") ? "added" : "modified";
}

/** What a file is after a later call in the turn changes it again. */
function laterKind(
	earlier: Tally["kind"],
	later: FileChangeKind,
): Tally["kind"] {
	if (earlier === "added" || earlier === "gone") {
		if (later === "deleted") return "gone";
		return "added";
	}
	if (earlier === "deleted")
		return later === "deleted" ? "deleted" : "modified";
	return later === "added" ? "modified" : later;
}

function sumStats(
	left: DiffStats | null,
	right: DiffStats | null,
): DiffStats | null {
	if (!left || !right) return null;
	return {
		additions: left.additions + right.additions,
		deletions: left.deletions + right.deletions,
	};
}

function minLine(
	left: number | undefined,
	right: number | undefined,
): number | undefined {
	if (left === undefined) return right;
	if (right === undefined) return left;
	return Math.min(left, right);
}

function touches(call: ToolCall): TurnFileChange[] {
	if (locatedOnly(call)) {
		const kind = call.toolKind === "delete" ? "deleted" : "modified";
		return [
			...new Set((call.locations ?? []).map((location) => location.path)),
		].map((path) => ({
			path,
			kind,
			stats: null,
			line: firstChangeLine(call, path, []),
		}));
	}
	const byPath = new Map<string, DiffToolContent[]>();
	for (const diff of diffsOf(call)) {
		byPath.set(diff.path, [...(byPath.get(diff.path) ?? []), diff]);
	}
	return [...byPath].map(([path, diffs]) => ({
		path,
		kind: callKind(diffs, call.toolKind),
		stats: diffs
			.map(countedStats)
			.reduce<DiffStats | null>(sumStats, { additions: 0, deletions: 0 }),
		line: firstChangeLine(call, path, diffs),
	}));
}

/**
 * The files a turn's tool calls changed, once each, in the order the agent
 * first touched them. Stats add up every call's hunks, so a file edited twice
 * can count a line twice; edits made through a shell never show here.
 */
export function turnChangedFiles(calls: readonly ToolCall[]): TurnFileChange[] {
	const tallies = new Map<string, Tally>();
	for (const call of calls) {
		if (!changesFiles(call)) continue;
		for (const touch of touches(call)) {
			const earlier = tallies.get(touch.path);
			tallies.set(
				touch.path,
				earlier
					? {
							path: earlier.path,
							kind: laterKind(earlier.kind, touch.kind),
							stats: sumStats(earlier.stats, touch.stats),
							line: minLine(earlier.line, touch.line),
						}
					: touch,
			);
		}
	}
	return [...tallies.values()].flatMap(({ kind, stats, ...rest }) => {
		if (kind === "gone") return [];
		return [
			{
				...rest,
				kind,
				stats: stats && {
					additions: kind === "deleted" ? 0 : stats.additions,
					deletions: kind === "added" ? 0 : stats.deletions,
				},
			},
		];
	});
}
