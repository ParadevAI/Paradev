import type { ReactNode } from "react";

/** @here, @channel or @everyone, highlighted like a mention of you. */
export function BroadcastChip({ children }: { children: ReactNode }) {
	return (
		<span className="rounded bg-primary/15 px-0.5 font-medium text-foreground">
			{children}
		</span>
	);
}
