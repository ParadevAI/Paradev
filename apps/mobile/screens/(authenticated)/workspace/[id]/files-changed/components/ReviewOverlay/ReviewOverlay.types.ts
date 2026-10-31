import type { ComponentType } from "react";

export interface ReviewOverlayProps {
	draftCount: number;
	onFinishReview: () => void;
	onJumpToFile: () => void;
}

/** The diff screen's bottom bar: send the draft comments, jump to a file. */
export type ReviewOverlayComponent = ComponentType<ReviewOverlayProps>;
