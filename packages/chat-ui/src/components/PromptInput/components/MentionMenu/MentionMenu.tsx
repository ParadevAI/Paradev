"use client";

import { cn } from "@superset/ui/utils";
import { MentionList, type MentionListProps } from "../MentionList";

export type MentionMenuProps = MentionListProps;

export function MentionMenu({ className, ...list }: MentionMenuProps) {
	if (list.sections.length === 0) return null;
	return (
		<div
			role="listbox"
			className={cn(
				"relative z-50 w-full rounded-2xl bg-popover/95 p-1.5 shadow-xl ring-1 ring-border backdrop-blur-sm",
				className,
			)}
		>
			<MentionList {...list} />
		</div>
	);
}
