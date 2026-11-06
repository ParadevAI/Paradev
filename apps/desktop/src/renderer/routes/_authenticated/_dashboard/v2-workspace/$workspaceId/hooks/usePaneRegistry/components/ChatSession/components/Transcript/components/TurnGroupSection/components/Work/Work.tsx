import type { ReactNode } from "react";

/** A rule down the left of a turn's opened work, so the answer below reads as separate from it. */
export function Work({
	folded,
	children,
}: {
	folded: boolean | undefined;
	children: ReactNode;
}) {
	return folded ? (
		<div className="border-l-2 border-border/70 pl-3">{children}</div>
	) : (
		children
	);
}
