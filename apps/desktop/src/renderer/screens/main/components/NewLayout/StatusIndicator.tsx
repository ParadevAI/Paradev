import type React from "react";

export type WorkspaceStatus = "planning" | "working" | "needs-feedback" | "ready-to-merge";

interface StatusIndicatorProps {
	status: WorkspaceStatus;
	showLabel?: boolean;
	size?: "sm" | "md";
}

const STATUS_CONFIG: Record<
	WorkspaceStatus,
	{ label: string; dotColor: string }
> = {
	planning: {
		label: "Planning",
		dotColor: "bg-blue-500",
	},
	working: {
		label: "Working",
		dotColor: "bg-yellow-500",
	},
	"needs-feedback": {
		label: "Needs Feedback",
		dotColor: "bg-orange-500",
	},
	"ready-to-merge": {
		label: "Ready to Merge",
		dotColor: "bg-green-500",
	},
};

export const StatusIndicator: React.FC<StatusIndicatorProps> = ({
	status,
	showLabel = true,
	size = "sm",
}) => {
	const config = STATUS_CONFIG[status];
	const dotSize = size === "sm" ? "w-1.5 h-1.5" : "w-2 h-2";

	return (
		<div className="flex items-center gap-1.5">
			<div className={`rounded-full ${dotSize} ${config.dotColor}`} />
			{showLabel && (
				<span className="text-xs text-neutral-400">
					{config.label}
				</span>
			)}
		</div>
	);
};
