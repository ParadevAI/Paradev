import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { CommandEmpty, CommandGroup, CommandList } from "@superset/ui/command";
import { useCallback, useMemo } from "react";
import type { AccessibleV2Workspace } from "renderer/routes/_authenticated/_dashboard/v2-workspaces/hooks/useAccessibleV2Workspaces";
import { useSwitcherGroups } from "../../hooks/useSwitcherGroups";
import { useSwitchToWorkspace } from "../../hooks/useSwitchToWorkspace";
import {
	rankSwitcherRows,
	type SwitcherBucket,
	type SwitcherRow,
} from "../../utils/bucketWorkspaces";
import { WorkspaceSwitcherRow } from "../WorkspaceSwitcherRow";
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
	const { groups, query: parsed } = useSwitcherGroups(query);
	const trimmed = parsed.text;

	const results = useMemo(
		() => (trimmed ? rankSwitcherRows(groups, trimmed) : null),
		[groups, trimmed],
	);
	const ordered = useMemo(
		() => results ?? groups.flatMap((group) => group.rows),
		[results, groups],
	);

	const switchTo = useSwitchToWorkspace("switcher");
	const select = useCallback(
		(
			row: SwitcherRow<AccessibleV2Workspace>,
			index: number,
			viaHold: boolean,
		) => switchTo(row, index, { searched: trimmed.length > 0, hold: viaHold }),
		[switchTo, trimmed],
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
