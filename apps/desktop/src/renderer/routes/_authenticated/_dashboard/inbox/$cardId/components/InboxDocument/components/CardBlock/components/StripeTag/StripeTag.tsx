import { cn } from "@superset/ui/utils";
import type { ReactNode } from "react";
import {
	INBOX_TONE,
	type InboxTone,
} from "renderer/routes/_authenticated/_dashboard/utils/inboxTone";

interface StripeTagProps {
	tone?: Exclude<InboxTone, "done">;
	children: ReactNode;
}

/** A small pill for one fact of a Stripe object: its status, "Test mode", "Drafted". */
export function StripeTag({ tone = "neutral", children }: StripeTagProps) {
	return (
		<span
			className={cn(
				"shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[10.5px] font-medium",
				INBOX_TONE[tone],
			)}
		>
			{children}
		</span>
	);
}
