import { cn } from "../../../../lib/utils";
import { Avatar, AvatarFallback } from "../../../ui/avatar";
import { initials } from "./utils/initials";

/** Fixed palette hues, not theme tokens, so a person keeps one colour in both themes. */
const HUES = [
	"bg-orange-600",
	"bg-teal-600",
	"bg-sky-700",
	"bg-violet-600",
	"bg-rose-600",
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
		<span
			title={name}
			className={cn(
				"inline-flex min-w-0 max-w-full items-center gap-2",
				className,
			)}
		>
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
