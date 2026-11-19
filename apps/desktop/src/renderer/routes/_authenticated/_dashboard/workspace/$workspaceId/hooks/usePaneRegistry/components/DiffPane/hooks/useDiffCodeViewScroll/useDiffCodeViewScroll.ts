import type {
	CodeViewItem,
	CodeViewLineScrollTarget,
	CodeViewScrollTarget,
	FileDiffMetadata,
} from "@pierre/diffs";
import type { CodeViewHandle } from "@pierre/diffs/react";
import { type RefObject, useCallback, useEffect, useMemo, useRef } from "react";
import type { DiffPaneData } from "../../../../../../types";
import {
	type ChangesetFile,
	getChangesetFileKey,
} from "../../../../../useChangeset";
import type { DiffAnnotationMetadata } from "../useDiffAnnotations";
import {
	type AssertedScroll,
	shouldReassertScroll,
} from "./shouldReassertScroll";
import { shouldRestoreCachedScrollState } from "./shouldRestoreCachedScrollState";

interface UseDiffCodeViewScrollOptions {
	codeViewRef: RefObject<CodeViewHandle<
		DiffAnnotationMetadata,
		undefined
	> | null>;
	data: DiffPaneData;
	fileByItemId: ReadonlyMap<string, ChangesetFile>;
	items: CodeViewItem<DiffAnnotationMetadata>[];
	expandUnchanged: boolean;
	collapsedSet: ReadonlySet<string>;
	setCollapsed: (path: string, value: boolean) => void;
	scrollStateKey: string;
	initialScrollState?: { scrollTop: number; updatedAt: number };
}

interface UseDiffCodeViewScrollResult {
	targetItemId?: string;
	/** Call on every CodeView `onScroll` event. A scroll that lands outside
	 *  our own programmatic `scrollTo`'s settle window is treated as the user
	 *  taking over, which releases the sticky re-scroll below for the current
	 *  click until a new one arrives. */
	notifyScroll: () => void;
	/** Call on user input in the diff (wheel, touch, pointer, key). It releases
	 *  the sticky re-scroll at once: while layout keeps shifting, each re-scroll
	 *  restarts the settle window, so `notifyScroll` alone never lets go. */
	releaseScroll: () => void;
}

// @pierre/diffs' default critically-damped spring settles a smooth-auto
// scroll in ~440ms (see SmoothScrollSettings.omega). Give it headroom so the
// animation's own scroll events aren't mistaken for the user grabbing the
// scrollbar.
const PROGRAMMATIC_SCROLL_SETTLE_MS = 700;

function getFirstChangedLine(
	fileDiff: FileDiffMetadata,
): Pick<CodeViewLineScrollTarget, "lineNumber" | "side"> | undefined {
	const hunk = fileDiff.hunks[0];
	if (!hunk) return undefined;
	const change = hunk.hunkContent.find((block) => block.type === "change");
	if (!change) return undefined;
	if (change.additions > 0) {
		return {
			lineNumber:
				hunk.additionStart +
				(change.additionLineIndex - hunk.additionLineIndex),
			side: "additions",
		};
	}
	return {
		lineNumber:
			hunk.deletionStart + (change.deletionLineIndex - hunk.deletionLineIndex),
		side: "deletions",
	};
}

export function useDiffCodeViewScroll({
	codeViewRef,
	data,
	fileByItemId,
	items,
	expandUnchanged,
	collapsedSet,
	setCollapsed,
	scrollStateKey,
	initialScrollState,
}: UseDiffCodeViewScrollOptions): UseDiffCodeViewScrollResult {
	// Identifies the click/focus request currently being tracked, and whether
	// it's still "sticky" — i.e. whether we should keep re-asserting
	// `scrollTo` for it as `items` shifts under the viewport (a deferred
	// diff loading in, a comment thread arriving) instead of
	// landing once and never correcting for drift.
	const activeScrollKeyRef = useRef<string | null>(null);
	const stickyRef = useRef(true);
	const lastProgrammaticScrollAtRef = useRef(0);
	const lastAssertedRef = useRef<AssertedScroll | null>(null);
	const resolvedScrollStateKeyRef = useRef<string | null>(null);
	const itemById = useMemo(() => {
		const map = new Map<string, CodeViewItem<DiffAnnotationMetadata>>();
		for (const item of items) {
			map.set(item.id, item);
		}
		return map;
	}, [items]);
	// Prefer the change key (disambiguates a path that appears in several source
	// groups). Fall back to matching on path for diff panes persisted before
	// change-key tracking, which only carry `path`.
	const targetItemId = useMemo(() => {
		if (data.changeKey) return `diff:${data.changeKey}`;
		if (!data.path) return undefined;
		for (const item of items) {
			if (fileByItemId.get(item.id)?.path === data.path) return item.id;
		}
		return undefined;
	}, [data.changeKey, data.path, items, fileByItemId]);

	useEffect(() => {
		const scrollKey = [
			targetItemId ?? "",
			data.focusLine ?? "",
			data.focusSide ?? "",
			data.focusTick ?? "",
		].join(":");
		if (resolvedScrollStateKeyRef.current !== scrollStateKey) {
			activeScrollKeyRef.current = null;
			stickyRef.current = true;
			lastAssertedRef.current = null;
			if (shouldRestoreCachedScrollState(initialScrollState, data.focusTick)) {
				const instance = codeViewRef.current?.getInstance();
				if (!instance || items.length === 0) return;
				codeViewRef.current?.scrollTo({
					type: "position",
					position: initialScrollState.scrollTop,
					behavior: "instant",
				});
				activeScrollKeyRef.current = scrollKey;
				resolvedScrollStateKeyRef.current = scrollStateKey;
				return;
			}
			resolvedScrollStateKeyRef.current = scrollStateKey;
		}

		// A new click (or focus target) always re-arms sticky tracking, even
		// if the user had released a previous one by scrolling manually.
		if (activeScrollKeyRef.current !== scrollKey) {
			activeScrollKeyRef.current = scrollKey;
			stickyRef.current = true;
		}
		if (!stickyRef.current) return;

		if (!targetItemId) return;
		const file = fileByItemId.get(targetItemId);
		const targetItem = itemById.get(targetItemId);
		if (!file || !targetItem) return;
		const changeKey = getChangesetFileKey(file);
		if (collapsedSet.has(changeKey)) {
			setCollapsed(changeKey, false);
			return;
		}

		let line: Pick<CodeViewLineScrollTarget, "lineNumber" | "side"> | undefined;
		if (targetItem.type === "diff") {
			if (data.focusLine != null) {
				line = { lineNumber: data.focusLine, side: data.focusSide };
			} else if (expandUnchanged) {
				line = getFirstChangedLine(targetItem.fileDiff);
			}
		}
		const fileTarget = {
			type: "item",
			id: targetItemId,
			align: "start",
			behavior: "smooth-auto",
		} as const;
		const target: CodeViewScrollTarget = line
			? { ...fileTarget, type: "line", ...line, align: "center" }
			: fileTarget;
		// A placeholder can gain a line target without changing the item top.
		const assertedScrollKey = line
			? `${scrollKey}:${line.side ?? ""}:${line.lineNumber}`
			: scrollKey;

		// Re-assert only when the target actually moved under us (or this is a
		// new request). CodeView suspends pointer events on its pinned header
		// for a settle window after every `scrollTo`, so re-firing on unrelated
		// re-renders made the pinned header's buttons drop clicks and snapped
		// the viewport back whenever the user scrolled away.
		const targetTop = codeViewRef.current
			?.getInstance()
			?.getTopForItem(targetItemId);
		if (
			!shouldReassertScroll(
				lastAssertedRef.current,
				assertedScrollKey,
				targetTop,
			)
		)
			return;

		// Pierre drops a line it cannot place (an outdated comment's line, or
		// one in folded context); the file scroll queued first then stands.
		if (line) codeViewRef.current?.scrollTo(fileTarget);
		codeViewRef.current?.scrollTo(target);
		lastAssertedRef.current = { scrollKey: assertedScrollKey, targetTop };
		lastProgrammaticScrollAtRef.current = Date.now();
	}, [
		codeViewRef,
		data.focusLine,
		data.focusSide,
		data.focusTick,
		expandUnchanged,
		initialScrollState,
		items,
		scrollStateKey,
		targetItemId,
		fileByItemId,
		itemById,
		collapsedSet,
		setCollapsed,
	]);

	const notifyScroll = useCallback(() => {
		if (
			Date.now() - lastProgrammaticScrollAtRef.current <
			PROGRAMMATIC_SCROLL_SETTLE_MS
		) {
			return;
		}
		stickyRef.current = false;
	}, []);

	const releaseScroll = useCallback(() => {
		stickyRef.current = false;
	}, []);

	return { targetItemId, notifyScroll, releaseScroll };
}
