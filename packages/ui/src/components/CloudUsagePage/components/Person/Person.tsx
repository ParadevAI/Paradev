import { cn } from "../../../../lib/utils";
import { Avatar, AvatarFallback } from "../../../ui/avatar";
import { initials } from "./utils/initials";

const HUES = [
	"bg-chart-1",
	"bg-chart-2",
	"bg-chart-3",
	"bg-chart-4",
	"bg-chart-5",
];

export function Person({
	name,
	className,
}: {
	name: string;
	className?: string;
}) {
	const hue =
		HUES[[...name].reduce((sum, c) => sum + c.charCodeAt(0), 0) % HUES.length];
	return (
		<span className={cn("inline-flex min-w-0 items-center gap-2", className)}>
			<Avatar className="size-5 shrink-0">
				<AvatarFallback
					className={cn("text-[0.6rem] font-semibold text-white", hue)}
				>
					{initials(name)}
				</AvatarFallback>
			</Avatar>
			<span className="truncate">{name}</span>
		</span>
	);
}
