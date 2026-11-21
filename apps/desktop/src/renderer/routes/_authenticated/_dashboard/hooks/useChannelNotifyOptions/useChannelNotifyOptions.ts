import { useLingui } from "@lingui/react/macro";
import type { RouterOutputs } from "@superset/trpc";
import { cloudTrpc } from "renderer/lib/cloud-trpc";

type ChannelNotify = NonNullable<
	RouterOutputs["channel"]["list"][number]["notify"]
>;

export type ChannelNotifyOption = ChannelNotify | "default";

/**
 * A channel's notification choices, Slack's order: the person's default
 * (named after what it resolves to), then each level.
 */
export function useChannelNotifyOptions() {
	const { t } = useLingui();
	const { data: prefs } = cloudTrpc.channelNotificationPrefs.get.useQuery();
	const levels: Record<ChannelNotify, string> = {
		all: t({ message: "All messages" }),
		mentions: t({ message: "Just mentions" }),
		none: t({ message: "Nothing" }),
	};
	const fallback = levels[prefs?.notify ?? "all"];
	const options: { value: ChannelNotifyOption; label: string }[] = [
		{ value: "default", label: t({ message: `Default (${fallback})` }) },
		{ value: "all", label: levels.all },
		{ value: "mentions", label: levels.mentions },
		{ value: "none", label: levels.none },
	];
	return {
		options,
		labelFor: (notify: ChannelNotify | null) =>
			notify ? levels[notify] : fallback,
		toOption: (notify: ChannelNotify | null): ChannelNotifyOption =>
			notify ?? "default",
		fromOption: (option: ChannelNotifyOption): ChannelNotify | null =>
			option === "default" ? null : option,
	};
}
