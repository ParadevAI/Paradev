import { Trans, useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { formatDateTime } from "@superset/i18n/format";
import type { RouterInputs, RouterOutputs } from "@superset/trpc";
import { Input } from "@superset/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { toast } from "@superset/ui/sonner";
import { Switch } from "@superset/ui/switch";
import { useState } from "react";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { PLATFORM } from "shared/constants";
import { SettingRow } from "./components/SettingRow";

type Prefs = RouterOutputs["channelNotificationPrefs"]["get"];
type PrefsUpdate = RouterInputs["channelNotificationPrefs"]["update"];

const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];
const WEEKDAYS = [1, 2, 3, 4, 5];
const HALF_HOURS = Array.from({ length: 48 }, (_, index) => index * 30);

/** Slack's Preferences → Notifications, for channels. */
export function ChannelNotificationSettings() {
	const { t } = useLingui();
	const utils = cloudTrpc.useUtils();
	const { data: prefs } = cloudTrpc.channelNotificationPrefs.get.useQuery();
	const update = cloudTrpc.channelNotificationPrefs.update.useMutation({
		onMutate: async (patch) => {
			await utils.channelNotificationPrefs.get.cancel();
			const previous = utils.channelNotificationPrefs.get.getData();
			utils.channelNotificationPrefs.get.setData(undefined, (current) =>
				current ? ({ ...current, ...patch } as Prefs) : current,
			);
			return { previous };
		},
		onError: (error, _patch, context) => {
			utils.channelNotificationPrefs.get.setData(undefined, context?.previous);
			toast.error(
				errorMessage(error, t({ message: "Couldn't save the change" })),
			);
		},
		onSettled: () => void utils.channelNotificationPrefs.get.invalidate(),
	});
	const save = (patch: PrefsUpdate) => update.mutate(patch);
	const [keywords, setKeywords] = useState<string | null>(null);

	if (!prefs) return null;

	const timeLabel = (minute: number) =>
		formatDateTime(new Date(2000, 0, 1, Math.floor(minute / 60), minute % 60), {
			timeStyle: "short",
		});
	const days =
		prefs.scheduleDays.length === 7
			? "every_day"
			: prefs.scheduleDays.join() === WEEKDAYS.join()
				? "weekdays"
				: "custom";
	const saveKeywords = () => {
		if (keywords === null) return;
		save({
			keywords: keywords
				.split(",")
				.map((keyword) => keyword.trim())
				.filter(Boolean),
		});
		setKeywords(null);
	};
	const timeSelect = (
		id: string,
		value: number,
		onChange: (minute: number) => void,
	) => (
		<Select
			value={String(value)}
			onValueChange={(next) => onChange(Number(next))}
		>
			<SelectTrigger id={id} className="w-[120px]">
				<SelectValue />
			</SelectTrigger>
			<SelectContent>
				{HALF_HOURS.map((minute) => (
					<SelectItem key={minute} value={String(minute)}>
						{timeLabel(minute)}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);

	return (
		<div className="space-y-6">
			<div>
				<h3 className="text-sm font-semibold">
					<Trans>Channels</Trans>
				</h3>
			</div>

			<SettingRow id="channel-notify" label={<Trans>Notify me about</Trans>}>
				<Select
					value={prefs.notify}
					onValueChange={(notify) =>
						save({ notify: notify as Prefs["notify"] })
					}
				>
					<SelectTrigger id="channel-notify" className="w-[180px]">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">
							<Trans>All new messages</Trans>
						</SelectItem>
						<SelectItem value="mentions">
							<Trans>Just mentions</Trans>
						</SelectItem>
						<SelectItem value="none">
							<Trans>Nothing</Trans>
						</SelectItem>
					</SelectContent>
				</Select>
			</SettingRow>

			<SettingRow
				id="channel-preview"
				label={<Trans>Include a preview of the message</Trans>}
			>
				<Switch
					id="channel-preview"
					checked={prefs.showPreview}
					onCheckedChange={(showPreview) => save({ showPreview })}
				/>
			</SettingRow>

			<SettingRow
				id="channel-keywords"
				label={<Trans>My keywords</Trans>}
				description={
					<Trans>
						Messages with these words notify you like a mention. Separate them
						with commas.
					</Trans>
				}
			>
				<Input
					id="channel-keywords"
					className="w-[240px]"
					value={keywords ?? prefs.keywords.join(", ")}
					onChange={(event) => setKeywords(event.target.value)}
					onBlur={saveKeywords}
					onKeyDown={(event) => {
						if (event.key === "Enter") saveKeywords();
					}}
				/>
			</SettingRow>

			<SettingRow
				id="channel-schedule"
				label={<Trans>Notification schedule</Trans>}
				description={
					<Trans>Outside these hours, channels do not notify you.</Trans>
				}
			>
				<Switch
					id="channel-schedule"
					checked={prefs.scheduleEnabled}
					onCheckedChange={(scheduleEnabled) =>
						save({
							scheduleEnabled,
							timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
						})
					}
				/>
			</SettingRow>

			{prefs.scheduleEnabled && (
				<div className="flex flex-wrap items-center gap-2 text-sm">
					<Select
						value={days}
						onValueChange={(next) =>
							save({ scheduleDays: next === "weekdays" ? WEEKDAYS : EVERY_DAY })
						}
					>
						<SelectTrigger className="w-[140px]">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="every_day">
								<Trans>Every day</Trans>
							</SelectItem>
							<SelectItem value="weekdays">
								<Trans>Weekdays</Trans>
							</SelectItem>
							{days === "custom" && (
								<SelectItem value="custom" disabled>
									<Trans>Custom</Trans>
								</SelectItem>
							)}
						</SelectContent>
					</Select>
					{timeSelect(
						"channel-schedule-start",
						prefs.scheduleStartMinute,
						(scheduleStartMinute) => save({ scheduleStartMinute }),
					)}
					<span className="text-muted-foreground">
						<Trans>to</Trans>
					</span>
					{timeSelect(
						"channel-schedule-end",
						prefs.scheduleEndMinute,
						(scheduleEndMinute) => save({ scheduleEndMinute }),
					)}
				</div>
			)}

			{PLATFORM.IS_MAC && (
				<SettingRow
					id="channel-bounce"
					label={<Trans>Bounce the Dock icon</Trans>}
					description={<Trans>When a channel notifies you</Trans>}
				>
					<Select
						value={prefs.dockBounce}
						onValueChange={(dockBounce) =>
							save({ dockBounce: dockBounce as Prefs["dockBounce"] })
						}
					>
						<SelectTrigger id="channel-bounce" className="w-[180px]">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="off">
								<Trans>Never</Trans>
							</SelectItem>
							<SelectItem value="once">
								<Trans>Once</Trans>
							</SelectItem>
							<SelectItem value="until_focused">
								<Trans>Until I open the app</Trans>
							</SelectItem>
						</SelectContent>
					</Select>
				</SettingRow>
			)}
		</div>
	);
}
