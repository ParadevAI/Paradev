import { Trans, useLingui } from "@lingui/react/macro";
import { formatDate } from "@superset/i18n/format";
import { Button } from "@superset/ui/button";
import { Popover, PopoverAnchor, PopoverContent } from "@superset/ui/popover";
import { useState } from "react";
import type { CardAction, LinearCycleView } from "../../../../types";
import {
	addDays,
	dayOf,
	type ZoneDay,
	zonedInstant,
} from "../../../../utils/zoneTime";
import { ActionButton } from "../../../ActionButton";
import { DateField } from "../../../DateField";
import { TimeSelect } from "../../../TimeSelect";
import { type SnoozeChoice, snoozeTimes } from "../../utils/snoozeTimes";

interface SnoozeMenuProps {
	action: CardAction | undefined;
	pending: boolean;
	cycles: readonly LinearCycleView[];
	onSnooze: (until: Date) => void;
}

const MORNING_MINUTE = 9 * 60;
const FIELD =
	"h-8 rounded-md border border-input bg-background px-2 text-[13px] text-foreground outline-none focus-visible:border-foreground/40";

const ROW =
	"flex h-8 items-center justify-between gap-6 rounded-md px-2 text-left text-[13px] text-foreground outline-none hover:bg-fill-hover focus-visible:bg-fill-hover";

/** Linear's snooze menu: an hour, tomorrow, next week, a month, the next cycle, or a time of the reader's own. */
export function SnoozeMenu({
	action,
	pending,
	cycles,
	onSnooze,
}: SnoozeMenuProps) {
	const { t } = useLingui();
	const [open, setOpen] = useState(false);
	const [custom, setCustom] = useState<{ day: ZoneDay; minute: number } | null>(
		null,
	);
	const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
	const labels: Record<SnoozeChoice, string> = {
		hour: t({ message: "An hour from now" }),
		tomorrow: t({ message: "Tomorrow" }),
		week: t({ message: "Next week" }),
		month: t({ message: "A month from now" }),
		cycle: t({ message: "Next cycle" }),
	};
	const pick = (until: Date) => {
		setOpen(false);
		setCustom(null);
		onSnooze(until);
	};
	const customTime = custom
		? zonedInstant(custom.day, custom.minute, timeZone)
		: null;
	return (
		<Popover
			open={open}
			onOpenChange={(next) => {
				setOpen(next);
				if (!next) setCustom(null);
			}}
		>
			<PopoverAnchor asChild>
				<span className="inline-flex">
					<ActionButton
						action={action}
						pending={pending}
						variant="ghost"
						aria-haspopup="listbox"
						onClick={() => setOpen(true)}
					>
						<Trans>Snooze</Trans>
					</ActionButton>
				</span>
			</PopoverAnchor>
			<PopoverContent align="start" className="w-80 p-1">
				{custom === null ? (
					<div
						role="listbox"
						aria-label={t({ message: "Snooze" })}
						className="flex flex-col"
					>
						{snoozeTimes(new Date(), cycles).map(({ id, at }) => (
							<button
								key={id}
								type="button"
								role="option"
								aria-selected={false}
								data-snooze={id}
								onClick={() => pick(at)}
								className={ROW}
							>
								{labels[id]}
								<span className="text-xs text-muted-foreground">
									{formatDate(at, {
										weekday: "short",
										day: "numeric",
										month: "short",
										hour: "numeric",
										minute: "2-digit",
									})}
								</span>
							</button>
						))}
						<button
							type="button"
							role="option"
							aria-selected={false}
							data-snooze="custom"
							onClick={() =>
								setCustom({
									day: addDays(dayOf(Date.now(), timeZone), 1),
									minute: MORNING_MINUTE,
								})
							}
							className={ROW}
						>
							<Trans>Custom…</Trans>
						</button>
					</div>
				) : (
					<div className="flex items-center gap-2 p-1">
						<DateField
							className={FIELD}
							value={custom.day}
							label={t({ message: "Snooze date" })}
							onChange={(day) => setCustom({ ...custom, day })}
						/>
						<TimeSelect
							className={FIELD}
							day={custom.day}
							value={custom.minute}
							timeZone={timeZone}
							label={t({ message: "Snooze time" })}
							onChange={(minute) => setCustom({ ...custom, minute })}
						/>
						<span className="flex-1" />
						<Button
							type="button"
							size="sm"
							disabled={customTime === null || customTime <= Date.now()}
							onClick={() => customTime !== null && pick(new Date(customTime))}
						>
							<Trans>Snooze</Trans>
						</Button>
					</div>
				)}
			</PopoverContent>
		</Popover>
	);
}
