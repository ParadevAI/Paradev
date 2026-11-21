import { cn } from "@superset/ui/utils";

interface RailAlertDotProps {
	className?: string;
}

export function RailAlertDot({ className }: RailAlertDotProps) {
	return (
		<span
			aria-hidden="true"
			className={cn("size-1.5 shrink-0 rounded-full bg-red-500", className)}
		/>
	);
}
