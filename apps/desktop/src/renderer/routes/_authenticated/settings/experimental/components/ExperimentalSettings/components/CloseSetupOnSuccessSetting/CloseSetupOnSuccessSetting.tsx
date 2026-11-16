import { useLingui } from "@lingui/react/macro";
import { Label } from "@superset/ui/label";
import { Switch } from "@superset/ui/switch";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { HighlightText } from "renderer/routes/_authenticated/settings/components/HighlightText";
import { useSettingsSearchQuery } from "renderer/stores/settings-state";

export function CloseSetupOnSuccessSetting() {
	const { t } = useLingui();
	const searchQuery = useSettingsSearchQuery();
	const utils = electronTrpc.useUtils();
	const { data: closeSetupOnSuccess, isLoading } =
		electronTrpc.settings.getCloseSetupOnSuccess.useQuery();
	const setCloseSetupOnSuccess =
		electronTrpc.settings.setCloseSetupOnSuccess.useMutation({
			onMutate: async ({ enabled }) => {
				await utils.settings.getCloseSetupOnSuccess.cancel();
				const previous = utils.settings.getCloseSetupOnSuccess.getData();
				utils.settings.getCloseSetupOnSuccess.setData(undefined, enabled);
				return { previous };
			},
			onError: (_err, _vars, context) => {
				if (context?.previous !== undefined) {
					utils.settings.getCloseSetupOnSuccess.setData(
						undefined,
						context.previous,
					);
				}
			},
			onSettled: () => {
				utils.settings.getCloseSetupOnSuccess.invalidate();
			},
		});

	return (
		<div className="flex items-center justify-between gap-6">
			<div className="min-w-0 flex-1 space-y-0.5">
				<Label htmlFor="close-setup-on-success" className="text-sm font-medium">
					<HighlightText
						text={t({
							message: "Close Workspace Setup tab when setup succeeds",
						})}
						query={searchQuery}
					/>
				</Label>
				<p className="text-xs text-muted-foreground">
					<HighlightText
						text={t({
							message:
								"Close the tab when the setup commands finish without errors. When setup fails, the tab stays open so you can see the error",
						})}
						query={searchQuery}
					/>
				</p>
			</div>
			<Switch
				id="close-setup-on-success"
				checked={closeSetupOnSuccess ?? false}
				onCheckedChange={(enabled) =>
					setCloseSetupOnSuccess.mutate({ enabled })
				}
				disabled={isLoading || setCloseSetupOnSuccess.isPending}
			/>
		</div>
	);
}
