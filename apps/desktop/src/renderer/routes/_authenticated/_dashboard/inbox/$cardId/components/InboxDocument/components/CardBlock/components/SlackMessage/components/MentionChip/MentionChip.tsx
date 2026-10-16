import { cn } from "@superset/ui/utils";
import { forwardRef } from "react";

interface MentionChipProps {
	prefix: "@" | "#";
	label: string;
	/** A mention of the reader, which Slack highlights in yellow. */
	self?: boolean;
}

/** A person, channel, group or broadcast named in a message, drawn the way Slack highlights it. */
export const MentionChip = forwardRef<HTMLSpanElement, MentionChipProps>(
	function MentionChip({ prefix, label, self = false, ...rest }, ref) {
		return (
			<span
				ref={ref}
				{...rest}
				className={cn(
					"inline cursor-default rounded-[3px] px-0.5",
					self
						? "bg-amber-400/25 text-amber-700 dark:text-amber-300"
						: "bg-sky-500/15 text-blue-500 hover:bg-sky-500/25 dark:text-sky-300",
				)}
			>
				{prefix}
				{label}
			</span>
		);
	},
);
