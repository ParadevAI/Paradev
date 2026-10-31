import { useLingui } from "@lingui/react/macro";
import { Label } from "@superset/ui/label";
import { toast } from "@superset/ui/sonner";
import { Switch } from "@superset/ui/switch";
import { useAcpChatEnabled } from "renderer/hooks/useAcpChatEnabled";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { HighlightText } from "renderer/routes/_authenticated/settings/components/HighlightText";
import { useSettingsSearchQuery } from "renderer/stores/settings-state";

export function AcpChatSetting() {
	const { t } = useLingui();
	const searchQuery = useSettingsSearchQuery();
	const savedEnabled = useAcpChatEnabled();
	const utils = cloudTrpc.useUtils();
	const updateSettings = cloudTrpc.userSettings.update.useMutation({
		onSuccess: (settings) =>
			utils.userSettings.get.setData(undefined, settings),
		onError: () =>
			toast.error(t({ message: "Couldn't update the Chat setting" })),
	});
	const enabled = updateSettings.isPending
		? updateSettings.variables.experimentalChat === true
		: savedEnabled;

	return (
		<div className="flex items-center justify-between gap-6">
			<div className="min-w-0 flex-1 space-y-0.5">
				<Label htmlFor="acp-chat" className="text-sm font-medium">
					<HighlightText text={t({ message: "Chat" })} query={searchQuery} />
				</Label>
				<p className="text-xs text-muted-foreground">
					<HighlightText
						text={t({
							message:
								"Open Claude and Codex sessions in a chat pane instead of a terminal.",
						})}
						query={searchQuery}
					/>
				</p>
			</div>
			<Switch
				id="acp-chat"
				checked={enabled}
				disabled={updateSettings.isPending}
				onCheckedChange={(next) =>
					updateSettings.mutate({ experimentalChat: next })
				}
			/>
		</div>
	);
}
