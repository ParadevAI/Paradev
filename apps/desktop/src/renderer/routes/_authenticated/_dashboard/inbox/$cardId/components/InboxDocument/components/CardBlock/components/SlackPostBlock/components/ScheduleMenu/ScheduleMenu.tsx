import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { useState } from "react";
import { LuChevronDown } from "react-icons/lu";
import {
	mondayMorning,
	slackClock,
	slackWeekday,
	tomorrowMorning,
} from "../../../../utils/slackWhen";
import { MINUTE_MS, SNAP_MINUTES } from "../../../../utils/zoneTime";

interface ScheduleMenuProps {
	timeZone: string;
	/** A time is chosen, so the menu also offers the way back. */
	scheduled: boolean;
	disabled: boolean;
	/** An instant to send at, or null to send now. */
	onPick: (postAt: number | null) => void;
}

const HOUR_MS = 60 * MINUTE_MS;
const SNAP_MS = SNAP_MINUTES * MINUTE_MS;
const ROW =
	"flex h-8 items-center rounded-md px-2 text-left text-[13px] text-foreground outline-none hover:bg-fill-hover focus-visible:bg-fill-hover";

/** The arrow beside Slack's send button: two times Slack offers, or one of the reader's own. */
export function ScheduleMenu({
	timeZone,
	scheduled,
	disabled,
	onPick,
}: ScheduleMenuProps) {
	const { t } = useLingui();
	const [open, setOpen] = useState(false);
	const now = Date.now();
	const tomorrow = tomorrowMorning(now, timeZone);
	const monday = mondayMorning(now, timeZone);
	const tomorrowClock = slackClock(tomorrow, timeZone);
	const mondayClock = slackClock(monday, timeZone);
	const weekday = slackWeekday(monday, timeZone);
	const pick = (postAt: number | null) => {
		setOpen(false);
		onPick(postAt);
	};
	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button
					type="button"
					size="sm"
					disabled={disabled}
					aria-label={t({ message: "Schedule for later" })}
					aria-haspopup="listbox"
					className="rounded-l-none border-l border-primary-foreground/25 px-1.5"
				>
					<LuChevronDown className="size-3.5" />
				</Button>
			</PopoverTrigger>
			<PopoverContent align="end" className="w-64 p-1">
				<div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
					<Trans>Schedule message</Trans>
				</div>
				<div
					role="listbox"
					aria-label={t({ message: "Schedule message" })}
					className="flex flex-col"
				>
					{scheduled && (
						<button
							type="button"
							role="option"
							aria-selected={false}
							onClick={() => pick(null)}
							className={ROW}
						>
							<Trans>Send now</Trans>
						</button>
					)}
					<button
						type="button"
						role="option"
						aria-selected={false}
						onClick={() => pick(tomorrow)}
						className={ROW}
					>
						<Trans>Tomorrow at {tomorrowClock}</Trans>
					</button>
					<button
						type="button"
						role="option"
						aria-selected={false}
						onClick={() => pick(monday)}
						className={ROW}
					>
						<Trans>
							{weekday} at {mondayClock}
						</Trans>
					</button>
					<button
						type="button"
						role="option"
						aria-selected={false}
						onClick={() =>
							pick(Math.ceil((Date.now() + HOUR_MS) / SNAP_MS) * SNAP_MS)
						}
						className={ROW}
					>
						<Trans>Custom time</Trans>
					</button>
				</div>
			</PopoverContent>
		</Popover>
	);
}
