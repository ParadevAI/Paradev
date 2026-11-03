import { Trans, useLingui } from "@lingui/react/macro";
import { CommandEmpty, CommandGroup, CommandList } from "@superset/ui/command";
import { type ReactNode, useMemo } from "react";
import { useIsV2CloudEnabled } from "renderer/hooks/useIsV2CloudEnabled";
import { useRecentlyViewed } from "renderer/routes/_authenticated/_dashboard/components/NavigationControls/components/HistoryDropdown/hooks/useRecentlyViewed";
import type { AccessibleV2Workspace } from "renderer/routes/_authenticated/_dashboard/v2-workspaces/hooks/useAccessibleV2Workspaces";
import { useCommandContext } from "../../core/ContextProvider";
import { rankSections, scoreCommand } from "../../core/rankCommands";
import type { Command } from "../../core/types";
import { useActiveCommands } from "../../core/useActiveCommands";
import { CommandItemRow } from "../CommandItemRow/CommandItemRow";
import { useSwitcherGroups } from "../WorkspaceList/hooks/useSwitcherGroups";
import {
	rankSwitcherRows,
	type SwitcherRow,
	switcherRowScore,
} from "../WorkspaceList/utils/bucketWorkspaces";
import { RootRecentSection } from "./components/RootRecentSection";
import { RootWorkspacesSection } from "./components/RootWorkspacesSection";
import { parseRootQuery } from "./utils/parseRootQuery";

const TOP_WORKSPACES = 3;
const MATCHED_WORKSPACES = 5;
const RECENT_PLACES = 3;

interface CommandListViewProps {
	query: string;
	onSelect: (command: Command) => void;
}

interface Block {
	key: string;
	best: number;
	node: ReactNode;
}

interface RootWorkspaceRows {
	workspaceRows: SwitcherRow<AccessibleV2Workspace>[];
	recentRows: SwitcherRow<AccessibleV2Workspace>[];
	/** What the workspace rows were ranked and marked by. */
	text: string;
	/** The query started with "#": it is about workspaces, not commands. */
	workspacesOnly: boolean;
}

function useRootWorkspaceRows(
	enabled: boolean,
	query: string,
): RootWorkspaceRows {
	const { groups, query: parsed } = useSwitcherGroups(query);
	const recentEntries = useRecentlyViewed(RECENT_PLACES * 3);
	return useMemo(() => {
		const text = parsed.text;
		const workspacesOnly = parsed.scope === "all";
		if (!enabled) {
			return { workspaceRows: [], recentRows: [], text, workspacesOnly };
		}
		if (text) {
			return {
				workspaceRows: rankSwitcherRows(groups, text).slice(
					0,
					MATCHED_WORKSPACES,
				),
				recentRows: [],
				text,
				workspacesOnly,
			};
		}
		const rows = groups.flatMap((group) => group.rows);
		const workspaceRows = rows
			.filter((row) => !row.isCurrent)
			.slice(0, workspacesOnly ? MATCHED_WORKSPACES : TOP_WORKSPACES);
		const shown = new Set(workspaceRows.map((row) => row.workspace.id));
		const byId = new Map(rows.map((row) => [row.workspace.id, row]));
		const recentRows: SwitcherRow<AccessibleV2Workspace>[] = [];
		for (const entry of recentEntries) {
			if (workspacesOnly) break;
			if (entry.type !== "v2-workspace") continue;
			const row = byId.get(entry.entityId);
			if (!row || row.isCurrent || shown.has(row.workspace.id)) continue;
			recentRows.push(row);
			if (recentRows.length === RECENT_PLACES) break;
		}
		return { workspaceRows, recentRows, text, workspacesOnly };
	}, [enabled, parsed, groups, recentEntries]);
}

export function CommandListView({ query, onSelect }: CommandListViewProps) {
	const { i18n } = useLingui();
	const context = useCommandContext();
	const sections = useActiveCommands(context);
	const isV2CloudEnabled = useIsV2CloudEnabled();
	const parsed = parseRootQuery(query);
	const trimmed = parsed.query.trim();
	const ranked = useMemo(
		() => rankSections(sections, parsed.query),
		[sections, parsed.query],
	);
	const { workspaceRows, recentRows, text, workspacesOnly } =
		useRootWorkspaceRows(isV2CloudEnabled && !parsed.commandsOnly, trimmed);
	const showsWorkspaces = isV2CloudEnabled && !parsed.commandsOnly;

	// With a query, workspaces and command sections rank against each other
	// on the same score; without one, workspaces and recent places lead.
	const blocks: Block[] = [];
	if (showsWorkspaces && (workspaceRows.length > 0 || !text)) {
		const first = workspaceRows[0];
		blocks.push({
			key: "workspaces",
			best: text && first ? switcherRowScore(first, text) : 1,
			node: (
				<RootWorkspacesSection
					key="workspaces"
					rows={workspaceRows}
					query={text}
				/>
			),
		});
	}
	if (recentRows.length > 0) {
		blocks.push({
			key: "recent",
			best: 1,
			node: <RootRecentSection key="recent" rows={recentRows} />,
		});
	}
	if (!(showsWorkspaces && workspacesOnly)) {
		for (const section of ranked) {
			const first = section.commands[0];
			blocks.push({
				key: section.id,
				best: trimmed && first ? scoreCommand(first, trimmed) : 0.5,
				node: (
					<CommandGroup key={section.id} heading={i18n._(section.label)}>
						{section.commands.map((command) => (
							<CommandItemRow
								key={command.id}
								command={command}
								onSelect={onSelect}
								query={trimmed}
							/>
						))}
					</CommandGroup>
				),
			});
		}
	}
	blocks.sort((a, b) => b.best - a.best);

	return (
		<CommandList>
			<CommandEmpty>
				<Trans>No results</Trans>
			</CommandEmpty>
			{blocks.map((block) => block.node)}
		</CommandList>
	);
}
