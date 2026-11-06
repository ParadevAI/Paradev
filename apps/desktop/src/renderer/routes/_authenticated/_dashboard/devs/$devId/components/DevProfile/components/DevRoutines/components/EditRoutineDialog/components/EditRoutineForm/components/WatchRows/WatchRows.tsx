import { Trans } from "@lingui/react/macro";
import type { Routine } from "../../../../../../types";
import { SettingRow } from "../SettingRow";

const PROVIDER_NAMES: Record<string, string> = {
	github: "GitHub",
	slack: "Slack",
	linear: "Linear",
	sentry: "Sentry",
	notion: "Notion",
	microsoft_teams: "Microsoft Teams",
	gmail: "Gmail",
};

function eventName(event: string) {
	const words = event.replace(/[._]/g, " ");
	return words.charAt(0).toUpperCase() + words.slice(1);
}

/** What an event routine watches, as the rows Dots shows for a monitored task. */
export function WatchRows({ watching }: { watching: Routine["watching"] }) {
	return (
		<div className="flex flex-col rounded-md border border-input">
			{watching.flatMap((watch) => {
				const id =
					watch.kind === "channel"
						? `channel:${watch.name}`
						: `${watch.provider}:${watch.event}:${watch.repositories.join(",")}`;
				return watch.kind === "channel"
					? [
							<SettingRow key={id} label={<Trans>Channel</Trans>}>
								#{watch.name}
							</SettingRow>,
						]
					: [
							<SettingRow
								key={`${id}:provider`}
								label={PROVIDER_NAMES[watch.provider] ?? watch.provider}
							>
								<Trans>Monitoring</Trans>
							</SettingRow>,
							...(watch.repositories.length
								? [
										<SettingRow
											key={`${id}:repository`}
											label={<Trans>Repository</Trans>}
										>
											{watch.repositories.join(", ")}
										</SettingRow>,
									]
								: []),
							...(watch.event
								? [
										<SettingRow
											key={`${id}:event`}
											label={<Trans>Event</Trans>}
										>
											{eventName(watch.event)}
										</SettingRow>,
									]
								: []),
						];
			})}
		</div>
	);
}
