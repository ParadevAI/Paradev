import { useLingui } from "@lingui/react/macro";
import { CommandGroup, CommandItem } from "@superset/ui/command";
import { Kbd, KbdGroup } from "@superset/ui/kbd";
import { Layers } from "lucide-react";
import { useHotkeyDisplay } from "renderer/hotkeys";
import type { AccessibleV2Workspace } from "renderer/routes/_authenticated/_dashboard/v2-workspaces/hooks/useAccessibleV2Workspaces";
import { openWorkspaceList } from "../../../../modules/navigation/commands";
import { WorkspaceSwitcherRow } from "../../../WorkspaceList/components/WorkspaceSwitcherRow";
import { useSwitchToWorkspace } from "../../../WorkspaceList/hooks/useSwitchToWorkspace";
import type { SwitcherRow } from "../../../WorkspaceList/utils/bucketWorkspaces";

interface RootWorkspacesSectionProps {
	rows: SwitcherRow<AccessibleV2Workspace>[];
	query: string;
}

/** The workspaces that most need you, in the commands root, with the way to every other one. */
export function RootWorkspacesSection({
	rows,
	query,
}: RootWorkspacesSectionProps) {
	const { t } = useLingui();
	const switchTo = useSwitchToWorkspace("palette");
	const switcher = useHotkeyDisplay("OPEN_WORKSPACE_LIST");
	return (
		<CommandGroup heading={t({ message: "Workspaces" })}>
			{rows.map((row, index) => (
				<WorkspaceSwitcherRow
					key={row.workspace.id}
					workspace={row.workspace}
					isCurrent={row.isCurrent}
					query={query}
					onSelect={() =>
						switchTo(row, index, { searched: query.length > 0, hold: false })
					}
				/>
			))}
			<CommandItem
				value="workspaces.all"
				onSelect={() => openWorkspaceList({ via: "command" })}
				className="gap-2.5 text-[13px]"
			>
				<span className="flex size-4 shrink-0 items-center justify-center text-muted-foreground">
					<Layers className="size-4" />
				</span>
				<span className="min-w-0 flex-1 truncate">
					{t({ message: "All workspaces" })}
				</span>
				{switcher.keys[0] !== "Unassigned" ? (
					<KbdGroup className="ml-auto">
						{switcher.keys.map((key, index) => (
							<Kbd
								// Chords never repeat a key, but a cap has no identity beyond its position.
								key={`${index}-${key}`}
								className="h-[18px] min-w-[18px] text-[11px]"
							>
								{key}
							</Kbd>
						))}
					</KbdGroup>
				) : null}
			</CommandItem>
		</CommandGroup>
	);
}
