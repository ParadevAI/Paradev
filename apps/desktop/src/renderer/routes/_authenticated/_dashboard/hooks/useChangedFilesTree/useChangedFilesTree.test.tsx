import { describe, expect, test } from "bun:test";
import type { FileTreeDirectoryHandle } from "@pierre/trees";
import { act, renderHook } from "@testing-library/react";
import type { FoldSignal } from "../useFoldSignal";
import {
	type ChangedFileEntry,
	useChangedFilesTree,
} from "./useChangedFilesTree";

function file(path: string): ChangedFileEntry {
	return { path, status: "modified", additions: 1, deletions: 0 };
}

const NO_FOLD: FoldSignal = { epoch: 0, action: "expand" };

function dir(model: { getItem(path: string): unknown }, path: string) {
	return model.getItem(path) as FileTreeDirectoryHandle;
}

describe("useChangedFilesTree", () => {
	test("keeps folder expansion when the file list changes", () => {
		const { result, rerender } = renderHook(
			({ files }) =>
				useChangedFilesTree({
					files,
					foldSignal: NO_FOLD,
					onSelectFile: () => {},
				}),
			{ initialProps: { files: [file("a/x.ts"), file("b/y.ts")] } },
		);
		act(() => dir(result.current.model, "a/").collapse());

		rerender({ files: [file("a/x.ts"), file("b/y.ts"), file("c/z.ts")] });

		const { model } = result.current;
		expect(dir(model, "a/").isExpanded()).toBe(false);
		expect(dir(model, "b/").isExpanded()).toBe(true);
		expect(dir(model, "c/").isExpanded()).toBe(true);
	});

	test("starts collapsed, and new folders stay collapsed, after a collapse-all", () => {
		const collapsed: FoldSignal = { epoch: 1, action: "collapse" };
		const { result, rerender } = renderHook(
			({ files }) =>
				useChangedFilesTree({
					files,
					foldSignal: collapsed,
					onSelectFile: () => {},
				}),
			{ initialProps: { files: [file("a/x.ts")] } },
		);
		expect(dir(result.current.model, "a/").isExpanded()).toBe(false);

		rerender({ files: [file("a/x.ts"), file("c/z.ts")] });

		expect(dir(result.current.model, "c/").isExpanded()).toBe(false);
	});
});
