import { cn } from "@superset/ui/utils";
import { RUN_STATUS_META } from "renderer/routes/_authenticated/_dashboard/automations/utils/runStatus";

export function RunStatusDot({ status }: { status: string }) {
	const meta = RUN_STATUS_META[status as keyof typeof RUN_STATUS_META];
	return (
		<span
			className={cn(
				"size-2 shrink-0 rounded-full",
				meta?.dot ?? "bg-muted-foreground",
			)}
		/>
	);
}
