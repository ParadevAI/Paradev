import { Trans, useLingui } from "@lingui/react/macro";
import { Label } from "@superset/ui/label";
import { HighlightText } from "renderer/routes/_authenticated/settings/components/HighlightText";
import { useSettingsSearchQuery } from "renderer/stores/settings-state";
import { CloudWorkspaceAccessSwitch } from "./components/CloudWorkspaceAccessSwitch";

interface CloudWorkspaceAccessSectionProps {
	organizationId: string;
	machineId: string;
	allowed: boolean;
}

export function CloudWorkspaceAccessSection({
	organizationId,
	machineId,
	allowed,
}: CloudWorkspaceAccessSectionProps) {
	const { t } = useLingui();
	const searchQuery = useSettingsSearchQuery();

	return (
		<div className="flex items-start justify-between gap-6">
			<div className="space-y-1 flex-1">
				<Label htmlFor="allow-cloud-workspaces" className="text-sm font-medium">
					<HighlightText
						text={t({
							message: "Allow my cloud workspaces to reach this host",
						})}
						query={searchQuery}
					/>
				</Label>
				<p className="text-xs text-muted-foreground">
					<Trans>
						Agents in your cloud workspaces can then use <code>--host</code> to
						run commands on this host. The host must be reachable through the
						relay.
					</Trans>
				</p>
			</div>
			<CloudWorkspaceAccessSwitch
				id="allow-cloud-workspaces"
				organizationId={organizationId}
				machineId={machineId}
				allowed={allowed}
			/>
		</div>
	);
}
