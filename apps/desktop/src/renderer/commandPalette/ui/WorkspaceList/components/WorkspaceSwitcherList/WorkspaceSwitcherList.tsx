import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { useFormat } from "@superset/i18n/react";
import { CommandEmpty, CommandGroup, CommandList } from "@superset/ui/command";
import { useCallback, useEffect, useMemo, useRef } from "react";
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

/** Every row is a full React row and the list is not virtualised: "#" can match thousands. */
const MAX_ROWS = 150;

const BUCKET_LABELS: Record<SwitcherBucket, MessageDescriptor> = {
	needsInput: msg({ message: "Needs input" }),
	completed: msg({ message: "Completed" }),
	running: msg({ message: "Running" }),
	recent: msg({ message: "Recent" }),
};

interface WorkspaceSwitcherListProps {
	query: string;
	cycle?: SwitcherCycle;
}

export function WorkspaceSwitcherList({
	query,
	cycle,
}: WorkspaceSwitcherListProps) {
	const { i18n, t } = useLingui();
	const { formatNumber } = useFormat();
	const { groups: allGroups, query: parsed } = useSwitcherGroups(query);
	const trimmed = parsed.text;

	const { results, groups, hiddenCount } = useMemo(() => {
		if (trimmed) {
			const ranked = rankSwitcherRows(allGroups, trimmed);
			return {
				results: ranked.slice(0, MAX_ROWS),
				groups: [],
				hiddenCount: Math.max(0, ranked.length - MAX_ROWS),
			};
		}
		let room = MAX_ROWS;
		let total = 0;
		const shown: typeof allGroups = [];
		for (const group of allGroups) {
			total += group.rows.length;
			if (room <= 0) continue;
			const rows = group.rows.slice(0, room);
			room -= rows.length;
			shown.push({ ...group, rows });
		}
		return {
			results: null,
			groups: shown,
			hiddenCount: Math.max(0, total - MAX_ROWS),
		};
	}, [allGroups, trimmed]);
	const ordered = useMemo(
		() => results ?? groups.flatMap((group) => group.rows),
		[results, groups],
	);
	const hiddenLabel = formatNumber(hiddenCount);

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

	const listRef = useRef<HTMLDivElement>(null);
	const listKey = `${parsed.scope}|${parsed.creator ?? ""}|${trimmed}`;
	// cmdk selects the first row of a changed list but leaves the scroll where
	// the old selection was. A frame later, so its own scroll runs first; by
	// then a key press may have moved the selection, and that scroll stands.
	// biome-ignore lint/correctness/useExhaustiveDependencies: listKey is the trigger
	useEffect(() => {
		const frame = requestAnimationFrame(() => {
			const list = listRef.current;
			const first = list?.querySelector("[cmdk-item]");
			if (list && first?.getAttribute("data-selected") === "true") {
				list.scrollTop = 0;
			}
		});
		return () => cancelAnimationFrame(frame);
	}, [listKey]);

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
		<CommandList ref={listRef}>
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
			{hiddenCount > 0 ? (
				<p className="px-4 pt-1 pb-2 text-[11.5px] text-muted-foreground">
					{t({ message: `${hiddenLabel} more. Type to narrow the list.` })}
				</p>
			) : null}
		</CommandList>
	);
}
