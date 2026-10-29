import { afterEach, describe, expect, mock, test } from "bun:test";
import type { CodeViewItem } from "@pierre/diffs";
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

describe("useDiffCodeViewScroll", () => {
	test("a line target queues its file first, so a line Pierre cannot place still lands on the file", () => {
		const scrollTo = mock((_target: unknown) => {});
		const codeViewRef = {
			current: {
				scrollTo,
				getInstance: () => ({ getTopForItem: () => 400 }),
			} as unknown as CodeViewHandle<DiffAnnotationMetadata>,
		};
		renderHook(() =>
			useDiffCodeViewScroll({
				codeViewRef,
				data: {
					path: "a.ts",
					changeKey: "unstaged:a.ts",
					collapsedFiles: [],
					focusLine: 22,
					focusTick: 1,
				},
				fileByItemId: new Map([[ITEM_ID, file]]),
				items: [
					{ id: ITEM_ID, type: "diff" },
				] as unknown as CodeViewItem<DiffAnnotationMetadata>[],
				collapsedSet: new Set(),
				setCollapsed: () => {},
				scrollStateKey: "pane-1",
			}),
		);

		expect(scrollTo.mock.calls.map(([target]) => target)).toEqual([
			{ type: "item", id: ITEM_ID, align: "start", behavior: "smooth-auto" },
			{
				type: "line",
				id: ITEM_ID,
				lineNumber: 22,
				side: undefined,
				align: "center",
				behavior: "smooth-auto",
			},
		]);
	});
});
