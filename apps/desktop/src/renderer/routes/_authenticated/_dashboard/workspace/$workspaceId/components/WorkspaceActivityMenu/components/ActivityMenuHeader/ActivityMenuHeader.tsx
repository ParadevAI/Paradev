import type { ComponentProps } from "react";
import { ShipActionsMenu } from "../ShipActionsMenu";

export function ActivityMenuHeader({
	title,
	...actions
}: { title: string } & Omit<
	ComponentProps<typeof ShipActionsMenu>,
	"pullRequest"
>) {
	return (
		<div className="flex h-8 items-center justify-between gap-2 pl-2 pr-1">
			<span className="min-w-0 truncate text-xs text-muted-foreground">
				{title}
			</span>
			<ShipActionsMenu {...actions} />
		</div>
	);
}
