import type { ComponentType } from "react";

export interface ForwardSwipeProps {
	enabled: boolean;
	onSwipeBegin: () => void;
}

/**
 * A pan from the enclosing screen's right edge calls `onSwipeBegin`. The
 * screen that handler pushes then follows the finger.
 */
export type ForwardSwipeComponent = ComponentType<ForwardSwipeProps>;
