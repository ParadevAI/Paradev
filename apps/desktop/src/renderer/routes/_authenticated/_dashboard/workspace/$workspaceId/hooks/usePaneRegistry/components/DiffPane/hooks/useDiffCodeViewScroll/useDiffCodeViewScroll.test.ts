import { afterEach, describe, expect, mock, test } from "bun:test";
import {
	type CodeViewItem,
	type CodeViewScrollTarget,
	parsePatchFiles,
} from "@pierre/diffs";
import type { CodeViewHandle } from "@pierre/diffs/react";
import { cleanup, renderHook } from "@testing-library/react";
import type { ChangesetFile } from "../../../../../useChangeset";
import type { DiffAnnotationMetadata } from "../useDiffAnnotations";
import { useDiffCodeViewScroll } from "./useDiffCodeViewScroll";

afterEach(cleanup);

const file: ChangesetFile = {
	path: "a.ts",
	status: "modified",
	additions: 1,
	deletions: 1,
	source: { kind: "unstaged" },
};
const ITEM_ID = "diff:unstaged:a.ts";
const itemTarget: CodeViewScrollTarget = {
	type: "item",
	id: ITEM_ID,
	align: "start",
	behavior: "smooth-auto",
};

type Item = CodeViewItem<DiffAnnotationMetadata>;
type ScrollOptions = Parameters<typeof useDiffCodeViewScroll>[0];

function diffItem(addition = true): Item {
	const patch = [
		"diff --git a/a.ts b/a.ts",
		"--- a/a.ts",
		"+++ b/a.ts",
		`@@ -1397,7 +1397,${addition ? 7 : 6} @@`,
		" context a",
		" context b",
		" context c",
		"-old line",
		...(addition ? ["+new line"] : []),
		" context d",
		" context e",
		" context f",
		"",
	].join("\n");
	return {
		id: ITEM_ID,
		type: "diff",
		fileDiff: parsePatchFiles(patch)[0].files[0],
	};
}

function renderScroll(items: Item[], options: Partial<ScrollOptions> = {}) {
	const scrollTo = mock((_target: CodeViewScrollTarget) => {});
	const codeViewRef = {
		current: {
			scrollTo,
			getInstance: () => ({ getTopForItem: () => 400 }),
		} as unknown as CodeViewHandle<DiffAnnotationMetadata, undefined>,
	};
	const hook = renderHook(
		({ items }) =>
			useDiffCodeViewScroll({
				codeViewRef,
				data: {
					path: "a.ts",
					changeKey: "unstaged:a.ts",
					collapsedFiles: [],
					focusTick: 1,
				},
				fileByItemId: new Map([[ITEM_ID, file]]),
				items,
				expandUnchanged: true,
				collapsedSet: new Set(),
				setCollapsed: () => {},
				scrollStateKey: "pane-1",
				...options,
			}),
		{ initialProps: { items } },
	);
	return {
		...hook,
		targets: () => scrollTo.mock.calls.map(([target]) => target),
	};
}

describe("useDiffCodeViewScroll", () => {
	test("an explicit line target queues the file first and takes precedence over the first change", () => {
		const { targets } = renderScroll([diffItem()], {
			data: {
				path: "a.ts",
				changeKey: "unstaged:a.ts",
				collapsedFiles: [],
				focusLine: 22,
				focusSide: "deletions",
				focusTick: 1,
			},
		});

		expect(targets()).toEqual([
			itemTarget,
			{
				type: "line",
				id: ITEM_ID,
				lineNumber: 22,
				side: "deletions",
				align: "center",
				behavior: "smooth-auto",
			},
		]);
	});

	test("targets the first changed line when a pending diff loads at the same top", () => {
		const pending: Item = {
			id: ITEM_ID,
			type: "file",
			file: { name: file.path, contents: " " },
		};
		const { rerender, targets } = renderScroll([pending]);
		expect(targets()).toEqual([itemTarget]);

		const loaded = diffItem();
		rerender({ items: [loaded] });
		rerender({ items: [loaded] });
		expect(targets()).toEqual([
			itemTarget,
			itemTarget,
			{
				type: "line",
				id: ITEM_ID,
				lineNumber: 1400,
				side: "additions",
				align: "center",
				behavior: "smooth-auto",
			},
		]);
	});

	test("targets a deleted line in a hunk with no additions", () => {
		const { targets } = renderScroll([diffItem(false)]);

		expect(targets()).toEqual([
			itemTarget,
			{
				type: "line",
				id: ITEM_ID,
				lineNumber: 1400,
				side: "deletions",
				align: "center",
				behavior: "smooth-auto",
			},
		]);
	});

	test("keeps the file header as the target when unchanged lines are folded", () => {
		const { targets } = renderScroll([diffItem()], { expandUnchanged: false });

		expect(targets()).toEqual([itemTarget]);
	});
});
