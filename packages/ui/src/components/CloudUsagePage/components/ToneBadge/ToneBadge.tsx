import type { ReactNode } from "react";
import { cn } from "../../../../lib/utils";
import { Badge } from "../../../ui/badge";
import type { Tone } from "../../constants";

const TONES: Record<Tone, string> = {
	ok: "border-success/40 bg-success/10 text-success",
	warn: "border-warning/50 bg-warning/10 text-warning",
	bad: "border-destructive/50 bg-destructive/10 text-destructive",
	idle: "border-foreground/25 bg-foreground/5 text-foreground",
};

export function ToneBadge({
	tone,
	children,
}: {
	tone: Tone;
	children: ReactNode;
}) {
	return (
		<Badge variant="outline" className={cn("whitespace-nowrap", TONES[tone])}>
			{children}
		</Badge>
	);
}
