import { cn } from "@superset/ui/utils";
import { type ComponentProps, forwardRef, type ReactNode } from "react";

interface PanelRowProps extends Omit<ComponentProps<"div">, "children"> {
	icon?: ReactNode;
	label: ReactNode;
	trailing?: ReactNode;
}

export const PanelRow = forwardRef<HTMLDivElement, PanelRowProps>(
	function PanelRow({ icon, label, trailing, className, ...props }, ref) {
		return (
			<div
				ref={ref}
				className={cn(
					"group flex min-h-9 items-center justify-between gap-3 rounded-md px-2 text-[13px] hover:bg-fill-hover",
					className,
				)}
				{...props}
			>
				<span className="flex min-w-0 items-center gap-2">
					{icon && (
						<span className="flex size-4 shrink-0 items-center justify-center text-muted-foreground">
							{icon}
						</span>
					)}
					<span className="truncate">{label}</span>
				</span>
				{trailing !== undefined && (
					<span className="flex shrink-0 items-center gap-1 text-muted-foreground">
						{trailing}
					</span>
				)}
			</div>
		);
	},
);
