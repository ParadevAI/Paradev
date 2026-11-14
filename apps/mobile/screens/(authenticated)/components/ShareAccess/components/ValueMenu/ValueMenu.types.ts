import type { ComponentType } from "react";

export interface ValueMenuItem {
	key: string;
	label: string;
	checked?: boolean;
	onSelect: () => void;
}

export interface ValueMenuProps {
	/** Omit for an ellipsis trigger. */
	label?: string;
	a11yLabel: string;
	tone?: "muted" | "foreground";
	size?: number;
	weight?: "regular" | "medium" | "semibold";
	chevron?: "down" | "right" | "upDown";
	disabled?: boolean;
	items: ValueMenuItem[];
}

/** A pull-down menu anchored to its trigger: a label with a chevron, or an ellipsis. */
export type ValueMenuComponent = ComponentType<ValueMenuProps>;
