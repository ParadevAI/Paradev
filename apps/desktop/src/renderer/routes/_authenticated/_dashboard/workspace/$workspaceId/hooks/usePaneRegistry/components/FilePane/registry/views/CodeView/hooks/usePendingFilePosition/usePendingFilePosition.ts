import { type RefObject, useEffect } from "react";
import type { CodeEditorAdapter } from "renderer/routes/_authenticated/components/CodeEditor/CodeEditorAdapter";
import type { ViewProps } from "../../../../types";

interface PendingFilePositionOptions {
	editorRef: RefObject<Pick<CodeEditorAdapter, "revealPosition"> | null>;
	isReady: boolean;
	isActive: boolean;
	pendingPosition: ViewProps["pendingPosition"];
	onPositionRevealed: ViewProps["onPositionRevealed"];
}

export function usePendingFilePosition({
	editorRef,
	isReady,
	isActive,
	pendingPosition,
	onPositionRevealed,
}: PendingFilePositionOptions) {
	useEffect(() => {
		if (!isReady || !isActive || !pendingPosition || !editorRef.current) return;
		editorRef.current.revealPosition(
			pendingPosition.line,
			pendingPosition.column,
		);
		onPositionRevealed?.();
	}, [editorRef, isReady, isActive, pendingPosition, onPositionRevealed]);
}
