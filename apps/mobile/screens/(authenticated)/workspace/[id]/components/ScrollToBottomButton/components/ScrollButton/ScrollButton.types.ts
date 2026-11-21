import type { ComponentType } from "react";

export interface ScrollButtonProps {
	icon: "arrowDown" | "chevronDown";
	onPress: () => void;
	/** Wider than the 44pt default; never narrower. */
	diameter?: number;
}

export type ScrollButtonComponent = ComponentType<ScrollButtonProps>;
