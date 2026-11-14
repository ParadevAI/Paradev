import { Trans, useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { Button } from "@superset/ui/button";
import { Label } from "@superset/ui/label";
import { toast } from "@superset/ui/sonner";
import { Switch } from "@superset/ui/switch";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { TRPCClientError } from "@trpc/client";
import { useId } from "react";
import { useHostServiceInfo } from "renderer/hooks/host-service/useHostServiceInfo";
import {
	getHostServiceClientByUrl,
	hostServiceQueryRetry,
	hostServiceQueryRetryDelay,
} from "renderer/lib/host-service-client";
import { HighlightText } from "renderer/routes/_authenticated/settings/components/HighlightText";
import { useSettingsSearchQuery } from "renderer/stores/settings-state";

interface PowerSectionProps {
	hostUrl: string | null;
	isOnline: boolean;
	canEdit: boolean;
}

export function PowerSection({
	hostUrl,
	isOnline,
	canEdit,
}: PowerSectionProps) {
	const { t } = useLingui();
	const id = useId();
	const searchQuery = useSettingsSearchQuery();
	const queryClient = useQueryClient();
	const info = useHostServiceInfo(hostUrl, isOnline);
	const supported = info.data?.keepAwakeSupported === true;
	const capabilityFailed = info.isError && info.data === undefined;
	const queryKey = ["host-power-settings", hostUrl];
	const power = useQuery({
		queryKey,
		queryFn: () => {
			if (!hostUrl) throw new Error("no host url");
			return getHostServiceClientByUrl(hostUrl).settings.power.get.query();
		},
		enabled: supported && isOnline && hostUrl !== null,
		retry: hostServiceQueryRetry,
		retryDelay: hostServiceQueryRetryDelay,
	});
	const update = useMutation({
		mutationFn: (enabled: boolean) => {
			if (!hostUrl) throw new Error("no host url");
			return getHostServiceClientByUrl(hostUrl).settings.power.set.mutate({
				enabled,
			});
		},
		onSuccess: ({ enabled }) => {
			queryClient.setQueryData(queryKey, { enabled, supported: true });
		},
		onError: (error) => {
			toast.error(t({ message: "Failed to update setting" }), {
				description: errorMessage(error),
			});
		},
	});
	if (
		!capabilityFailed &&
		(!supported ||
			(power.error instanceof TRPCClientError &&
				power.error.data?.code === "NOT_FOUND"))
	) {
		return null;
	}

	return (
		<section className="space-y-3">
			<h3 className="text-sm font-medium">
				<HighlightText text={t({ message: "Power" })} query={searchQuery} />
			</h3>
			{supported && (
				<div className="flex items-start justify-between gap-6">
					<div>
						<Label htmlFor={id} className="text-sm font-normal">
							<HighlightText
								text={t({
									message: "Keep this computer awake while agents work",
								})}
								query={searchQuery}
							/>
						</Label>
						<p
							id={`${id}-description`}
							className="mt-1 text-xs text-muted-foreground"
						>
							<Trans>
								The display can still turn off. On battery power, normal sleep
								settings apply below 10%.
							</Trans>
						</p>
					</div>
					<Switch
						id={id}
						aria-describedby={`${id}-description`}
						checked={power.data?.enabled ?? false}
						disabled={
							!canEdit ||
							!isOnline ||
							!power.data?.supported ||
							power.isFetching ||
							update.isPending
						}
						onCheckedChange={(enabled) => update.mutate(enabled)}
					/>
				</div>
			)}
			{(capabilityFailed || power.isError) && (
				<div className="flex items-center gap-2 text-xs text-muted-foreground">
					<Trans>Could not load power settings.</Trans>
					<Button
						variant="ghost"
						size="sm"
						disabled={capabilityFailed ? info.isFetching : power.isFetching}
						onClick={() =>
							void (capabilityFailed ? info.refetch() : power.refetch())
						}
					>
						<Trans>Try again</Trans>
					</Button>
				</div>
			)}
		</section>
	);
}
