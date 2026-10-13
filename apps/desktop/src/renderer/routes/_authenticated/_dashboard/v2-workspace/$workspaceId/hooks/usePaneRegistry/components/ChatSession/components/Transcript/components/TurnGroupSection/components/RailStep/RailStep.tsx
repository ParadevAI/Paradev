import type { ReactNode } from "react";

// The spine runs under the row above; each step branches off it with a
// quarter curve that lands on the middle of its 28px row, and the last step
// ends the spine at its branch.
const RAIL_STEP =
	"relative pl-5 [--rail:color-mix(in_oklab,var(--color-foreground)_14%,var(--color-background))] before:absolute before:top-0 before:left-[6px] before:h-full before:w-px before:bg-(--rail) last:before:h-[7px] after:absolute after:top-[6px] after:left-[6px] after:size-2 after:rounded-bl-[8px] after:border-(--rail) after:border-b after:border-l";

export function RailStep({ children }: { children: ReactNode }) {
	return <div className={RAIL_STEP}>{children}</div>;
}
