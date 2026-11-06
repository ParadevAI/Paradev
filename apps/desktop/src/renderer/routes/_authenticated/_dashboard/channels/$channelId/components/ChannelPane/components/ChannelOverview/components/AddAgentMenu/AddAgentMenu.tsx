import { Trans, useLingui } from "@lingui/react/macro";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { LuPlus } from "react-icons/lu";
import { useAccessibleV2Workspaces } from "renderer/routes/_authenticated/_dashboard/v2-workspaces/hooks/useAccessibleV2Workspaces";
import { WHERE_FILTER_ANYWHERE } from "renderer/routes/_authenticated/_dashboard/v2-workspaces/stores/v2WorkspacesFilterStore";
import { useOptimisticActions } from "renderer/routes/_authenticated/hooks/useOptimisticActions";
import { useHostWorkspaces } from "renderer/routes/_authenticated/providers/HostWorkspacesProvider";
import { channelTag } from "../../../../../../hooks/useChannelAgents";
import { PaneSectionAction } from "../../../PaneSection";

const MAX_CHOICES = 25;

/** Files a workspace under the channel by tagging it with the channel's name. */
export function AddAgentMenu({ channelName }: { channelName: string }) {
	const { t } = useLingui();
	const tag = channelTag(channelName);
	const { all } = useAccessibleV2Workspaces({
		whereFilter: WHERE_FILTER_ANYWHERE,
	});
	const { workspaces: hostRows } = useHostWorkspaces();
	const { v2Workspaces } = useOptimisticActions();
	const tagsById = new Map(hostRows.map((row) => [row.id, row.tags ?? []]));
	const choices = all
		.filter(
			(workspace) =>
				workspace.hostType !== "cloud" &&
				workspace.archivedAt === null &&
				!tagsById.get(workspace.id)?.includes(tag),
		)
		.sort(
			(a, b) =>
				(b.lastAgentEventAt ?? b.createdAt.getTime()) -
				(a.lastAgentEventAt ?? a.createdAt.getTime()),
		)
		.slice(0, MAX_CHOICES);

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<span>
					<PaneSectionAction onClick={() => {}}>
						<LuPlus />
						<Trans>Add</Trans>
					</PaneSectionAction>
				</span>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-72">
				<DropdownMenuLabel className="text-[11px] font-medium text-muted-foreground">
					{t({ message: `Tag a workspace with #${tag}` })}
				</DropdownMenuLabel>
				{choices.length === 0 ? (
					<DropdownMenuItem disabled>
						<Trans>Every workspace is already here</Trans>
					</DropdownMenuItem>
				) : (
					choices.map((workspace) => (
						<DropdownMenuItem
							key={workspace.id}
							onSelect={() =>
								v2Workspaces.updateWorkspace(workspace.id, {
									tags: [...(tagsById.get(workspace.id) ?? []), tag],
								})
							}
						>
							<span className="flex min-w-0 flex-col">
								<span className="truncate text-[13px]">{workspace.name}</span>
								<span className="truncate text-[11px] text-muted-foreground">
									{workspace.projectName ?? workspace.branch}
								</span>
							</span>
						</DropdownMenuItem>
					))
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
