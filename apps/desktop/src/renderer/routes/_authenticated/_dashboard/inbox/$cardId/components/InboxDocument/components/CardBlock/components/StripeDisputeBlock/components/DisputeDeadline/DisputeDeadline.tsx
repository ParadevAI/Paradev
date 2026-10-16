import { Plural, Trans } from "@lingui/react/macro";
import { cn } from "@superset/ui/utils";
import { useNow } from "renderer/hooks/useNow";
import { stripeDate } from "../../../../utils/stripeDate";

const NOW_TICK_MS = 60_000;
const DAY_MS = 24 * 60 * 60_000;
const URGENT_DAYS = 3;

interface DisputeDeadlineProps {
	dueBy: string;
	pastDue: boolean;
}

/** When the bank wants the evidence, and how long that leaves. */
export function DisputeDeadline({ dueBy, pastDue }: DisputeDeadlineProps) {
	const now = useNow(NOW_TICK_MS);
	const date = stripeDate(dueBy);
	const days = Math.ceil((Date.parse(dueBy) - now.getTime()) / DAY_MS);
	const passed = pastDue || days <= 0;
	return (
		<span className="flex flex-wrap items-center gap-x-2">
			<Trans>Respond by {date}</Trans>
			<span
				className={cn(
					"text-xs",
					passed || days < URGENT_DAYS
						? "font-medium text-destructive"
						: "text-muted-foreground",
				)}
			>
				{passed ? (
					<Trans>Deadline passed</Trans>
				) : (
					<Plural value={days} one="# day left" other="# days left" />
				)}
			</span>
		</span>
	);
}
