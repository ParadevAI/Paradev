import { Trans, useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { formatDateTime } from "@superset/i18n/format";
import { FEATURE_FLAGS } from "@superset/shared/constants";
import {
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
} from "@superset/ui/dropdown-menu";
import { toast } from "@superset/ui/sonner";
import { useNavigate } from "@tanstack/react-router";
import { useFeatureFlagEnabled } from "posthog-js/react";
import { LuBellOff } from "react-icons/lu";
import { useNow } from "renderer/hooks/useNow";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { type PauseOption, pauseUntil } from "./utils/pauseUntil";

const NOW_TICK_MS = 30_000;

/** Slack's "Pause notifications" menu, for channels. */
export function PauseNotificationsSubMenu() {
	const { t } = useLingui();
	const navigate = useNavigate();
	const now = useNow(NOW_TICK_MS);
	const enabled = useFeatureFlagEnabled(FEATURE_FLAGS.CHANNELS) === true;
	const utils = cloudTrpc.useUtils();
	const { data: prefs } = cloudTrpc.channelNotificationPrefs.get.useQuery(
		undefined,
		{ enabled },
	);
	const update = cloudTrpc.channelNotificationPrefs.update.useMutation({
		onSuccess: (next) =>
			utils.channelNotificationPrefs.get.setData(undefined, next),
		onError: (error) =>
			toast.error(
				errorMessage(error, t({ message: "Couldn't save the change" })),
			),
	});
	if (!enabled) return null;

	const pausedUntil =
		prefs?.pausedUntil && prefs.pausedUntil > now ? prefs.pausedUntil : null;
	const options: { value: PauseOption; label: string }[] = [
		{ value: "30m", label: t({ message: "For 30 minutes" }) },
		{ value: "1h", label: t({ message: "For 1 hour" }) },
		{ value: "2h", label: t({ message: "For 2 hours" }) },
		{ value: "tomorrow", label: t({ message: "Until tomorrow" }) },
	];

	return (
		<DropdownMenuSub>
			<DropdownMenuSubTrigger className="gap-2">
				<LuBellOff className="h-4 w-4" />
				<span>
					<Trans>Pause notifications</Trans>
				</span>
			</DropdownMenuSubTrigger>
			<DropdownMenuSubContent>
				{pausedUntil && (
					<>
						<DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
							<Trans>
								Paused until{" "}
								{formatDateTime(pausedUntil, { timeStyle: "short" })}
							</Trans>
						</DropdownMenuLabel>
						<DropdownMenuItem
							onSelect={() => update.mutate({ pausedUntil: null })}
						>
							<Trans>Resume notifications</Trans>
						</DropdownMenuItem>
						<DropdownMenuSeparator />
					</>
				)}
				{options.map((option) => (
					<DropdownMenuItem
						key={option.value}
						onSelect={() =>
							update.mutate({
								pausedUntil: pauseUntil(option.value, new Date()),
							})
						}
					>
						{option.label}
					</DropdownMenuItem>
				))}
				<DropdownMenuSeparator />
				<DropdownMenuItem
					onSelect={() => void navigate({ to: "/settings/ringtones" })}
				>
					<Trans>Set a notification schedule</Trans>
				</DropdownMenuItem>
			</DropdownMenuSubContent>
		</DropdownMenuSub>
	);
}
