import { cn } from "@superset/ui/utils";

interface SketchBarProps {
	width: string;
	className?: string;
}

export function SketchBar({ width, className }: SketchBarProps) {
	return (
		<span
			style={{ width }}
			className={cn(
				"block h-1.5 rounded-full transition-colors duration-500",
				className ?? "bg-foreground/15",
			)}
		/>
	);
}
