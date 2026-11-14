import { cn } from "@superset/ui/utils";
import { type ExternalWorktreeSource, MAX_ICONS } from "../../constants";
import { ToolIcon } from "../ToolIcon";

interface ToolIconStackProps {
	sources: ExternalWorktreeSource[];
	size?: "sm" | "md";
}

export function ToolIconStack({ sources, size = "md" }: ToolIconStackProps) {
	return (
		<span
			className={cn(
				"flex shrink-0 items-center",
				size === "sm" ? "-space-x-0.5" : "-space-x-1",
			)}
		>
			{sources.slice(0, MAX_ICONS).map((source) => (
				<ToolIcon
					key={source}
					source={source}
					className={cn(
						"ring-2 ring-background",
						size === "sm" && "size-4 rounded-[4px] text-[8px]",
					)}
				/>
			))}
		</span>
	);
}
