import { Alert, AlertTitle } from "@superset/ui/alert";
import type { ReactNode } from "react";
import { LuTriangleAlert } from "react-icons/lu";

/** A cloud usage limit strip along the workspace's bottom edge. */
export function CloudUsageBanner({
	tone,
	message,
	actions,
}: {
	tone: "warning" | "destructive";
	message: ReactNode;
	actions: ReactNode;
}) {
	return (
		<Alert
			variant={tone}
			className="shrink-0 items-center rounded-none border-x-0 border-b-0 py-2"
		>
			<LuTriangleAlert aria-hidden="true" />
			<AlertTitle className="line-clamp-none flex flex-wrap items-center gap-x-3 gap-y-1 font-normal text-foreground/85">
				<span className="min-w-0 flex-1 select-text">{message}</span>
				{actions}
			</AlertTitle>
		</Alert>
	);
}
