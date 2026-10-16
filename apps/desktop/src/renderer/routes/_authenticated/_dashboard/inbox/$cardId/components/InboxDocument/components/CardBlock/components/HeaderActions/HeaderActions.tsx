import type { ReactNode } from "react";
import { createPortal } from "react-dom";

interface HeaderActionsProps {
	/** The right side of the card's header row; null until the card has drawn it. */
	slot: HTMLElement | null;
	children: ReactNode;
}

/** A card's secondary and "no" actions and its way to the source, drawn in the card's header row. */
export function HeaderActions({ slot, children }: HeaderActionsProps) {
	return slot ? createPortal(children, slot) : null;
}
