import { Plural } from "@lingui/react/macro";
import { LuZap } from "react-icons/lu";

interface AutomationDragPreviewProps {
	/** The dragged automation's name when only one moves. */
	name: string | undefined;
	count: number;
}

/** What follows the pointer while automations are dragged to a group. */
export function AutomationDragPreview({
	name,
	count,
}: AutomationDragPreviewProps) {
	return (
		<div className="pointer-events-none inline-flex h-8 max-w-72 items-center gap-2 rounded-md border border-border bg-popover px-3 text-sm font-medium shadow-lg">
			<LuZap className="size-3.5 shrink-0 text-muted-foreground" />
			<span className="truncate">
				{count === 1 && name ? (
					name
				) : (
					<Plural value={count} one="# automation" other="# automations" />
				)}
			</span>
		</div>
	);
}
