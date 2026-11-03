import { Trans, useLingui } from "@lingui/react/macro";
import { getActiveLocale } from "@superset/i18n/format";
import { Input } from "@superset/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { Switch } from "@superset/ui/switch";
import {
	type RepeatEvery,
	type ScheduleForm,
	WEEKDAYS,
	type Weekday,
} from "../../../../../../utils/scheduleForm";
import { clockLabel, timeChoices } from "../../../../../../utils/zoneLabels";
import { SettingRow } from "../SettingRow";

const EVERY: RepeatEvery[] = [
	"interval",
	"daily",
	"weekdays",
	"weekly",
	"monthly",
	"custom",
];
const TRIGGER =
	"h-7 w-auto gap-1 border-0 bg-transparent px-1 text-muted-foreground shadow-none hover:text-foreground dark:bg-transparent";
const FIELD =
	"h-7 w-auto border-0 bg-transparent text-right shadow-none dark:bg-transparent";

function weekdayName(day: Weekday) {
	return new Intl.DateTimeFormat(getActiveLocale(), {
		weekday: "long",
		timeZone: "UTC",
	}).format(Date.UTC(2024, 0, 1 + WEEKDAYS.indexOf(day)));
}

interface ScheduleFieldsProps {
	form: ScheduleForm;
	onChange: (patch: Partial<ScheduleForm>) => void;
}

/** Repeat, time and end, the way Dots edits a scheduled task. */
export function ScheduleFields({ form, onChange }: ScheduleFieldsProps) {
	const { t } = useLingui();
	const everyLabel: Record<RepeatEvery, string> = {
		interval: t({ message: "Interval" }),
		daily: t({ message: "Daily" }),
		weekdays: t({ message: "Weekdays" }),
		weekly: t({ message: "Weekly" }),
		monthly: t({ message: "Monthly" }),
		custom: t({ message: "Custom" }),
	};
	const custom = form.repeat && form.every === "custom";
	return (
		<div className="flex flex-col rounded-md border border-input">
			<SettingRow label={<Trans>Repeat routine</Trans>}>
				<Switch
					checked={form.repeat}
					onCheckedChange={(repeat) => onChange({ repeat })}
				/>
			</SettingRow>
			{form.repeat ? (
				<>
					<SettingRow label={<Trans>Repeat</Trans>}>
						<Select
							value={form.every}
							onValueChange={(every) =>
								onChange({ every: every as RepeatEvery })
							}
						>
							<SelectTrigger className={TRIGGER}>
								<SelectValue />
							</SelectTrigger>
							<SelectContent align="end">
								{EVERY.map((every) => (
									<SelectItem key={every} value={every}>
										{everyLabel[every]}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</SettingRow>
					{form.every === "interval" && (
						<SettingRow label={<Trans>Hours between runs</Trans>}>
							<Input
								type="number"
								min={1}
								max={24}
								value={form.intervalHours}
								onChange={(event) =>
									onChange({ intervalHours: Number(event.target.value) })
								}
								className={`${FIELD} w-16`}
							/>
						</SettingRow>
					)}
					{form.every === "weekly" && (
						<SettingRow label={<Trans>Day</Trans>}>
							<Select
								value={form.weekday}
								onValueChange={(weekday) =>
									onChange({ weekday: weekday as Weekday })
								}
							>
								<SelectTrigger className={TRIGGER}>
									<SelectValue />
								</SelectTrigger>
								<SelectContent align="end">
									{WEEKDAYS.map((day) => (
										<SelectItem key={day} value={day}>
											{weekdayName(day)}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</SettingRow>
					)}
					{form.every === "monthly" && (
						<SettingRow label={<Trans>Day of the month</Trans>}>
							<Input
								type="number"
								min={1}
								max={31}
								value={form.monthDay}
								onChange={(event) =>
									onChange({ monthDay: Number(event.target.value) })
								}
								className={`${FIELD} w-16`}
							/>
						</SettingRow>
					)}
					{custom && (
						<SettingRow label={<Trans>Rule</Trans>}>
							<Input
								value={form.customRule}
								onChange={(event) =>
									onChange({ customRule: event.target.value })
								}
								className={`${FIELD} font-mono text-xs`}
							/>
						</SettingRow>
					)}
				</>
			) : (
				<SettingRow label={<Trans>Date</Trans>}>
					<Input
						type="date"
						value={form.date}
						onChange={(event) => onChange({ date: event.target.value })}
						className={FIELD}
					/>
				</SettingRow>
			)}
			{!custom && (
				<SettingRow label={<Trans>Time</Trans>}>
					<Select
						value={form.time}
						onValueChange={(time) => onChange({ time })}
					>
						<SelectTrigger className={TRIGGER}>
							<SelectValue />
						</SelectTrigger>
						<SelectContent align="end" className="max-h-72">
							{timeChoices(form.time).map((time) => (
								<SelectItem key={time} value={time}>
									{clockLabel(time, form.date, form.timezone)}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</SettingRow>
			)}
			{form.repeat && !custom && (
				<SettingRow label={<Trans>End repeat</Trans>}>
					{form.endDate !== null && (
						<Input
							type="date"
							value={form.endDate}
							onChange={(event) => onChange({ endDate: event.target.value })}
							className={FIELD}
						/>
					)}
					<Select
						value={form.endDate === null ? "never" : "on"}
						onValueChange={(end) =>
							onChange({ endDate: end === "never" ? null : form.date })
						}
					>
						<SelectTrigger className={TRIGGER}>
							<SelectValue />
						</SelectTrigger>
						<SelectContent align="end">
							<SelectItem value="never">
								<Trans>Never</Trans>
							</SelectItem>
							<SelectItem value="on">
								<Trans>On a date</Trans>
							</SelectItem>
						</SelectContent>
					</Select>
				</SettingRow>
			)}
		</div>
	);
}
