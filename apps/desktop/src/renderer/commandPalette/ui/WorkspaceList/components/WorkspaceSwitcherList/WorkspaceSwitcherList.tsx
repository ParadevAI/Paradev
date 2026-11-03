import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { CommandEmpty, CommandGroup, CommandList } from "@superset/ui/command";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { useCallback, useMemo } from "react";
import { track } from "renderer/lib/analytics";
import { navigateToV2Workspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import {
	type AccessibleV2Workspace,
	useAccessibleV2Workspaces,
} from "renderer/routes/_authenticated/_dashboard/v2-workspaces/hooks/useAccessibleV2Workspaces";
import { useFrameStackStore } from "../../../../core/frames";
import {
	bucketWorkspaces,
	rankSwitcherRows,
	type SwitcherBucket,
	type SwitcherRow,
} from "../../utils/bucketWorkspaces";
import { WorkspaceSwitcherRow } from "./components/WorkspaceSwitcherRow";
import { type SwitcherCycle, useSwitcherCycle } from "./hooks/useSwitcherCycle";

const BUCKET_LABELS: Record<SwitcherBucket, MessageDescriptor> = {
	needsInput: msg({ message: "Needs input" }),
	completed: msg({ message: "Completed" }),
	running: msg({ message: "Running" }),
	recent: msg({ message: "Recent" }),
};

interface WorkspaceSwitcherListProps {
	query: string;
	/** Set by the root switcher: controlled selection, hotkey stepping, hold-to-switch. */
	cycle?: SwitcherCycle;
}

/** Every workspace, ordered by what needs you; a query ranks them into one list. */
export function WorkspaceSwitcherList({
	query,
	cycle,
}: WorkspaceSwitcherListProps) {
	const { i18n } = useLingui();
	const { all: workspaces } = useAccessibleV2Workspaces();
	const currentPath = useLocation({ select: (loc) => loc.pathname });
	const currentId = currentPath.match(/^\/v2-workspace\/([^/]+)/)?.[1] ?? null;
	const navigate = useNavigate();
	const setOpen = useFrameStackStore((s) => s.setOpen);
	const trimmed = query.trim();

	const groups = useMemo(
		() => bucketWorkspaces(workspaces, currentId),
		[workspaces, currentId],
	);
	const results = useMemo(
		() => (trimmed ? rankSwitcherRows(groups, trimmed) : null),
		[groups, trimmed],
	);
	const ordered = useMemo(
		() => results ?? groups.flatMap((group) => group.rows),
		[results, groups],
	);

	const select = useCallback(
		(
			row: SwitcherRow<AccessibleV2Workspace>,
			index: number,
			viaHold: boolean,
		) => {
			setOpen(false);
			if (row.isCurrent) return;
			track("workspace_switched", {
				via: "switcher",
				bucket: row.bucket,
				index,
				searched: trimmed.length > 0,
				hold: viaHold,
			});
			void navigateToV2Workspace(row.workspace.id, navigate);
		},
		[setOpen, trimmed, navigate],
	);

	useSwitcherCycle(cycle, ordered, trimmed, select);

	const renderRows = (
		rows: SwitcherRow<AccessibleV2Workspace>[],
		offset: number,
	) =>
		rows.map((row, index) => (
			<WorkspaceSwitcherRow
				key={row.workspace.id}
				workspace={row.workspace}
				isCurrent={row.isCurrent}
				query={trimmed}
				onSelect={() => select(row, offset + index, false)}
			/>
		));

	let offset = 0;
	return (
		<CommandList>
			<CommandEmpty>
				<Trans>No workspaces found.</Trans>
			</CommandEmpty>
			{results ? (
				<CommandGroup>{renderRows(results, 0)}</CommandGroup>
			) : (
				groups.map((group) => {
					const start = offset;
					offset += group.rows.length;
					return (
						<CommandGroup
							key={group.bucket}
							heading={i18n._(BUCKET_LABELS[group.bucket])}
						>
							{renderRows(group.rows, start)}
						</CommandGroup>
					);
				})
			)}
		</CommandList>
	);
}
