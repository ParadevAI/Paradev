import { Trans, useLingui } from "@lingui/react/macro";
import { formatDate, getActiveLocale } from "@superset/i18n/format";
import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { Input } from "@superset/ui/input";
import { useState } from "react";
import { LuCalendarDays } from "react-icons/lu";

/** Superset holds a scheduled send for at most this long. */
const MAX_DAYS = 7;

function at(day: Date, hour: number): Date {
	const value = new Date(day);
	value.setHours(hour, 0, 0, 0);
	return value;
}

/** Gmail's three suggestions: tomorrow morning, tomorrow afternoon, next Monday morning. */
/** The reader's time zone by name, as Gmail heads its schedule dialog. */
function timeZoneName(): string {
	return (
		new Intl.DateTimeFormat(getActiveLocale(), { timeZoneName: "long" })
			.formatToParts(new Date())
			.find((part) => part.type === "timeZoneName")?.value ?? ""
	);
}

export function scheduleSuggestions(now: Date): {
	label: "tomorrowMorning" | "tomorrowAfternoon" | "mondayMorning";
	when: Date;
}[] {
	const tomorrow = new Date(now);
	tomorrow.setDate(now.getDate() + 1);
	const monday = new Date(now);
	monday.setDate(now.getDate() + ((8 - now.getDay()) % 7 || 7));
	return [
		{ label: "tomorrowMorning", when: at(tomorrow, 8) },
		{ label: "tomorrowAfternoon", when: at(tomorrow, 13) },
		{ label: "mondayMorning", when: at(monday, 8) },
	];
}

function localInputValue(date: Date): string {
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

interface ScheduleSendDialogProps {
	open: boolean;
	onSchedule: (when: Date) => void;
	onCancel: () => void;
}

/** Gmail's Schedule send: three suggestions or a date and time of your own. */
export function ScheduleSendDialog({
	open,
	onSchedule,
	onCancel,
}: ScheduleSendDialogProps) {
	const { t } = useLingui();
	const [picking, setPicking] = useState(false);
	const now = new Date();
	const [custom, setCustom] = useState(() =>
		localInputValue(at(new Date(now.getTime() + 86_400_000), 8)),
	);
	const labels = {
		tomorrowMorning: t({ message: "Tomorrow morning" }),
		tomorrowAfternoon: t({ message: "Tomorrow afternoon" }),
		mondayMorning: t({ message: "Monday morning" }),
	};
	const latest = new Date(now.getTime() + MAX_DAYS * 86_400_000);
	const chosen = new Date(custom);
	const valid =
		!Number.isNaN(chosen.getTime()) &&
		chosen.getTime() > now.getTime() + 60_000 &&
		chosen <= latest;
	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				if (!next) {
					setPicking(false);
					onCancel();
				}
			}}
		>
			<DialogContent className="sm:max-w-sm">
				<DialogHeader>
					<DialogTitle>
						{picking ? (
							<Trans>Pick date & time</Trans>
						) : (
							<Trans>Schedule send</Trans>
						)}
					</DialogTitle>
					<DialogDescription>{timeZoneName()}</DialogDescription>
				</DialogHeader>
				{picking ? (
					<>
						<Input
							type="datetime-local"
							value={custom}
							min={localInputValue(now)}
							max={localInputValue(latest)}
							onChange={(event) => setCustom(event.target.value)}
						/>
						<DialogFooter>
							<Button variant="ghost" onClick={() => setPicking(false)}>
								<Trans>Cancel</Trans>
							</Button>
							<Button disabled={!valid} onClick={() => onSchedule(chosen)}>
								<Trans>Schedule send</Trans>
							</Button>
						</DialogFooter>
					</>
				) : (
					<div className="-mx-2 flex flex-col">
						{scheduleSuggestions(now).map((option) => (
							<button
								key={option.label}
								type="button"
								onClick={() => onSchedule(option.when)}
								className="flex items-center justify-between rounded-md px-2 py-2.5 text-left text-[14px] hover:bg-fill-hover"
							>
								<span>{labels[option.label]}</span>
								<span className="text-[13px] text-muted-foreground">
									{formatDate(option.when, {
										month: "short",
										day: "numeric",
										hour: "numeric",
										minute: "2-digit",
									})}
								</span>
							</button>
						))}
						<button
							type="button"
							onClick={() => setPicking(true)}
							className="mt-1 flex items-center gap-3 rounded-md border-t border-border px-2 pt-3 pb-2 text-left text-[14px] hover:bg-fill-hover"
						>
							<LuCalendarDays className="size-4 text-muted-foreground" />
							<Trans>Pick date & time</Trans>
						</button>
					</div>
				)}
			</DialogContent>
		</Dialog>
	);
}
