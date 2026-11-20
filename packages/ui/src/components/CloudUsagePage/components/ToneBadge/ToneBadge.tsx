import type { ReactNode } from "react";
import { Badge } from "../../../ui/badge";
import type { Tone } from "../../constants";

const VARIANTS = {
	ok: "success",
	warn: "warning",
	bad: "destructive",
} as const;

/** Exceptions get a badge; a quiet state is plain text, so the one that matters stands out. */
export function ToneBadge({
	tone,
	children,
}: {
	tone: Tone;
	children: ReactNode;
}) {
	if (tone === "idle") {
		return <span className="text-xs whitespace-nowrap">{children}</span>;
	}
	return <Badge variant={VARIANTS[tone]}>{children}</Badge>;
}
