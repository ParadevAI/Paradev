import { cn } from "@superset/ui/utils";
import {
	type ExternalWorktreeSource,
	SOURCE_ICONS,
	SOURCE_NAMES,
} from "../../constants";

interface ToolIconProps {
	source: ExternalWorktreeSource;
	className?: string;
}

export function ToolIcon({ source, className }: ToolIconProps) {
	const icon = SOURCE_ICONS[source];
	if (icon) {
		return (
			<img
				src={icon}
				alt=""
				className={cn("size-6 shrink-0 rounded-md", className)}
			/>
		);
	}
	return (
		<span
			aria-hidden
			className={cn(
				"flex size-6 shrink-0 items-center justify-center rounded-md bg-foreground/15 font-semibold text-[11px] text-foreground",
				className,
			)}
		>
			{SOURCE_NAMES[source].charAt(0)}
		</span>
	);
}
