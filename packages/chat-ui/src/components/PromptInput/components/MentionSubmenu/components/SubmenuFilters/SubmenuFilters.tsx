"use client";

import { Switch } from "@superset/ui/switch";
import type { ComposerMentionFilter } from "../../../../types";

export function SubmenuFilters({
	filters,
	active,
	onToggle,
}: {
	filters: readonly ComposerMentionFilter[];
	active: ReadonlySet<string>;
	onToggle: (id: string) => void;
}) {
	return (
		<div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 border-border/60 border-t px-3 pt-2 pb-1">
			{filters.map((filter) => {
				const id = `mention-filter-${filter.id}`;
				return (
					<label
						key={filter.id}
						htmlFor={id}
						className="flex cursor-pointer items-center gap-2 text-[13px] text-muted-foreground"
						onMouseDown={(event) => event.preventDefault()}
					>
						<Switch
							id={id}
							checked={active.has(filter.id)}
							onCheckedChange={() => onToggle(filter.id)}
							onMouseDown={(event) => event.preventDefault()}
						/>
						{filter.label}
					</label>
				);
			})}
		</div>
	);
}
