import { Trans, useLingui } from "@lingui/react/macro";
import { COMPANY } from "@superset/shared/constants";
import { Label } from "@superset/ui/label";
import { toast } from "@superset/ui/sonner";
import { Switch } from "@superset/ui/switch";
import { HiArrowTopRightOnSquare } from "react-icons/hi2";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { applyTelemetrySetting } from "renderer/lib/posthog-identity";
import { HighlightText } from "renderer/routes/_authenticated/settings/components/HighlightText";
import { useSettingsSearchQuery } from "renderer/stores/settings-state";

const enabledAtLaunch = window.App?.telemetryEnabled !== false;

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
					applyTelemetrySetting(
						context.previous.enabled && !context.previous.doNotTrack,
					);
				}
				toast.error(t({ message: "Couldn't update the usage data setting" }));
			},
			onSettled: () => utils.settings.getTelemetryState.invalidate(),
		});
	const doNotTrack = data?.doNotTrack ?? false;
	const enabled = !doNotTrack && (data?.enabled ?? true);
	const needsRestart =
		!doNotTrack && data !== undefined && enabled !== enabledAtLaunch;

	return (
		<div className="ph-no-capture flex items-center justify-between gap-6 p-4">
			<div className="min-w-0 flex-1 space-y-0.5">
				<Label htmlFor="telemetry" className="text-sm font-medium">
					<HighlightText
						text={t({ message: "Share usage data" })}
						query={searchQuery}
					/>
				</Label>
				<p className="text-xs text-muted-foreground">
					<Trans>
						Help improve Paradev by sending usage data and crash reports.{" "}
						<a
							href={COMPANY.PRIVACY_URL}
							target="_blank"
							rel="noopener noreferrer"
							className="inline-flex items-center gap-1 text-primary hover:underline"
						>
							Learn more
							<HiArrowTopRightOnSquare className="h-3 w-3" />
						</a>
					</Trans>
				</p>
				{needsRestart && (
					<p className="text-xs text-muted-foreground">
						<Trans>Restart Paradev to apply</Trans>
					</p>
				)}
				{doNotTrack && (
					<p className="text-xs text-muted-foreground">
						<Trans>Off because DO_NOT_TRACK is set in your environment.</Trans>
					</p>
				)}
			</div>
			<Switch
				id="telemetry"
				checked={enabled}
				onCheckedChange={(enabled) => {
					applyTelemetrySetting(enabled);
					setTelemetryEnabled.mutate({ enabled });
				}}
				disabled={isLoading || doNotTrack || setTelemetryEnabled.isPending}
			/>
		</div>
	);
}
