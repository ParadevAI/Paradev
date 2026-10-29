"use client";

import { cn } from "@superset/ui/utils";
import type { ReactNode } from "react";
import { MentionList, type MentionListProps } from "../MentionList";

export type MentionMenuProps = MentionListProps & {
	header?: ReactNode;
	label?: string;
};

export function MentionMenu({
	className,
	header,
	label,
	...list
}: MentionMenuProps) {
	if (list.sections.length === 0) return null;
	return (
		<div
			{...(header ? { role: "dialog", "aria-label": label } : {})}
			className={cn(
				"relative z-50 w-full rounded-2xl bg-popover/95 p-1.5 shadow-xl ring-1 ring-border backdrop-blur-sm",
				className,
			)}
		>
			{header}
			<div role="listbox" aria-label={label}>
				<MentionList {...list} />
			</div>
		</div>
	);
}
