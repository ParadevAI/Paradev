import type { ReactNode } from "react";
import { cn } from "../../../../lib/utils";
import { Badge } from "../../../ui/badge";
import type { Tone } from "../../constants";

const TONES: Record<Tone, string> = {
	ok: "border-success/40 text-success",
	warn: "border-warning/50 text-warning",
	bad: "border-destructive/50 text-destructive",
	idle: "text-muted-foreground",
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
