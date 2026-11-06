import { cn } from "@superset/ui/utils";
import type { ReactNode } from "react";

interface SpeakerMarkProps {
	/** Drawn in the square; the name's first letter when absent. */
	icon?: ReactNode;
	name: string;
	className?: string;
}

/** An agent's face in a channel: a rounded square, the coordinator's diamond or the agent's initial. */
export function SpeakerMark({ icon, name, className }: SpeakerMarkProps) {
	return (
		<span
			className={cn(
				"flex size-7 shrink-0 items-center justify-center rounded-[8px] border border-border bg-background text-[12px] font-semibold text-muted-foreground uppercase [&_svg]:size-3.5",
				className,
			)}
		>
			{icon ?? name.trim().charAt(0)}
		</span>
	);
}
