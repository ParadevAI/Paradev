import type { ReactNode } from "react";
import { cn } from "../../../../lib/utils";
import type { PillTone } from "../../constants";

const TONES: Record<PillTone, string> = {
	ok: "bg-success/10 text-success",
	warn: "bg-warning/10 text-warning",
	bad: "bg-destructive/10 text-destructive",
	idle: "bg-muted text-muted-foreground",
};

export function Pill({
	tone,
	children,
}: {
	tone: PillTone;
	children: ReactNode;
}) {
	return (
		<span
			className={cn(
				"inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-xs font-medium whitespace-nowrap",
				TONES[tone],
			)}
		>
			<span aria-hidden className="size-1.5 shrink-0 rounded-full bg-current" />
			{children}
		</span>
	);
}
