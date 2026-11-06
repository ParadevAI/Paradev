import { Check } from "lucide-react";
import { cn } from "../../../../../../../../lib/utils";

export function SelectionTick({ selected }: { selected: boolean }) {
	return (
		<span
			className={cn(
				"grid size-4 shrink-0 place-items-center rounded-full border",
				selected
					? "border-primary bg-primary text-primary-foreground"
					: "border-muted-foreground/50",
			)}
		>
			{selected ? <Check className="size-3" strokeWidth={3} /> : null}
		</span>
	);
}
