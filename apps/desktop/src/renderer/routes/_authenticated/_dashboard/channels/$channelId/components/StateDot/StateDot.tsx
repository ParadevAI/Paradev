import { cn } from "@superset/ui/utils";
import type { ChannelAgentState } from "../../hooks/useChannelAgents";

const COLOR: Record<ChannelAgentState, string> = {
	waiting: "bg-yellow-500 motion-safe:animate-pulse",
	working: "bg-amber-500",
	review: "bg-green-500",
	idle: "bg-muted-foreground/50",
	done: "bg-muted-foreground/35",
};

/** An agent's state as the sidebar draws a workspace's: one dot, the app's colours. */
export function StateDot({
	state,
	className,
}: {
	state: ChannelAgentState;
	className?: string;
}) {
	return (
		<span
			aria-hidden
			className={cn(
				"inline-block size-1.5 shrink-0 rounded-full",
				COLOR[state],
				className,
			)}
		/>
	);
}
