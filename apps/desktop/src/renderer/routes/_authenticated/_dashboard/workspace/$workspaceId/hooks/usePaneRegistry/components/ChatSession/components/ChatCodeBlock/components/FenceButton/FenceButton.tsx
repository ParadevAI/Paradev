import { cn } from "@superset/ui/utils";
import type { LucideIcon } from "lucide-react";
import { FENCE_BUTTON_CLASSNAME } from "../../constants";

/** An icon button in a fence's header row. */
export function FenceButton({
	className,
	icon: Icon,
	label,
	onClick,
	pressed,
}: {
	icon: LucideIcon;
	label: string;
	onClick: () => void;
	pressed?: boolean;
	className?: string;
}) {
	return (
		<button
			aria-label={label}
			aria-pressed={pressed}
			className={cn(
				FENCE_BUTTON_CLASSNAME,
				pressed && "bg-foreground/10 text-foreground",
				className,
			)}
			onClick={onClick}
			title={label}
			type="button"
		>
			<Icon className="size-3.5" />
		</button>
	);
}
