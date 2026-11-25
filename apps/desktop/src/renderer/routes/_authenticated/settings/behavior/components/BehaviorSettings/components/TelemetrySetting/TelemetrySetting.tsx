import { Trans, useLingui } from "@lingui/react/macro";
import { Label } from "@superset/ui/label";
import { toast } from "@superset/ui/sonner";
import { Switch } from "@superset/ui/switch";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { HighlightText } from "renderer/routes/_authenticated/settings/components/HighlightText";
import { useSettingsSearchQuery } from "renderer/stores/settings-state";

export function TelemetrySetting() {
	const { t } = useLingui();
	const searchQuery = useSettingsSearchQuery();
	const utils = electronTrpc.useUtils();
	const { data, isLoading } =
		electronTrpc.settings.getTelemetryState.useQuery();
	const setTelemetryEnabled =
		electronTrpc.settings.setTelemetryEnabled.useMutation({
			onMutate: async ({ enabled }) => {
				await utils.settings.getTelemetryState.cancel();
				const previous = utils.settings.getTelemetryState.getData();
				if (previous) {
					utils.settings.getTelemetryState.setData(undefined, {
						...previous,
						enabled,
					});
				}
				return { previous };
			},
			onError: (_error, _input, context) => {
				if (context?.previous) {
					utils.settings.getTelemetryState.setData(undefined, context.previous);
				}
				toast.error(t({ message: "Couldn't update the usage data setting" }));
			},
			onSettled: () => utils.settings.getTelemetryState.invalidate(),
		});
	const doNotTrack = data?.doNotTrack ?? false;

	return (
		<div className="flex items-center justify-between gap-6">
			<div className="min-w-0 flex-1 space-y-0.5">
				<Label htmlFor="telemetry" className="text-sm font-medium">
					<HighlightText
						text={t({ message: "Share usage data" })}
						query={searchQuery}
					/>
				</Label>
				<p className="text-xs text-muted-foreground">
					<Trans>
						Send usage analytics, session recordings and error reports from this
						computer to help improve Paradev. Restart the app to fully apply a
						change.
					</Trans>
				</p>
				{doNotTrack && (
					<p className="text-xs text-muted-foreground">
						<Trans>Off because DO_NOT_TRACK is set in your environment.</Trans>
					</p>
				)}
			</div>
			<Switch
				id="telemetry"
				checked={!doNotTrack && (data?.enabled ?? true)}
				onCheckedChange={(enabled) => setTelemetryEnabled.mutate({ enabled })}
				disabled={isLoading || doNotTrack || setTelemetryEnabled.isPending}
			/>
		</div>
	);
}
