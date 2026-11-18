import { cn } from "@superset/ui/utils";
import type { PortForwardStatus } from "shared/types";

interface PortForwardStatusDotProps {
	status: PortForwardStatus | undefined;
}

export function PortForwardStatusDot({ status }: PortForwardStatusDotProps) {
	return (
		<span
			className={cn(
				"size-1.5 shrink-0 rounded-full",
				!status && "bg-muted-foreground/40",
				status?.state === "active" && "bg-green-500",
				status?.state === "busy" && "bg-amber-500",
				status?.state === "error" && "bg-red-500",
			)}
		/>
	);
}
