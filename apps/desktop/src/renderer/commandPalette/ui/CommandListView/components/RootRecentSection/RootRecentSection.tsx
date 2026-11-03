import { useLingui } from "@lingui/react/macro";
import { CommandGroup } from "@superset/ui/command";
import type { AccessibleV2Workspace } from "renderer/routes/_authenticated/_dashboard/v2-workspaces/hooks/useAccessibleV2Workspaces";
import { WorkspaceSwitcherRow } from "../../../WorkspaceList/components/WorkspaceSwitcherRow";
import { useSwitchToWorkspace } from "../../../WorkspaceList/hooks/useSwitchToWorkspace";
import type { SwitcherRow } from "../../../WorkspaceList/utils/bucketWorkspaces";

interface RootRecentSectionProps {
	rows: SwitcherRow<AccessibleV2Workspace>[];
}

/** The places you were last, in the commands root. */
export function RootRecentSection({ rows }: RootRecentSectionProps) {
	const { t } = useLingui();
	const switchTo = useSwitchToWorkspace("recent");
	return (
		<CommandGroup heading={t({ message: "Recent" })}>
			{rows.map((row, index) => (
				<WorkspaceSwitcherRow
					key={row.workspace.id}
					workspace={row.workspace}
					isCurrent={row.isCurrent}
					query=""
					onSelect={() =>
						switchTo(row, index, { searched: false, hold: false })
					}
				/>
			))}
		</CommandGroup>
	);
}
