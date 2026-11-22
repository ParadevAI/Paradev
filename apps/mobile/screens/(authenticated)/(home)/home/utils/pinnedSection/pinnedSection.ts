import type { CloudWorkspaceRow } from "@/hooks/useCloudWorkspaces";
import type { HostWorkspaceItem } from "@/hooks/useHostWorkspaces";
import type { TerminalAttention } from "../../hooks/useHostTerminals/attention";
import type { HomeListItem } from "../../types";
import { strongestAttention } from "../strongestAttention";

export const PINNED_PLACE_ID = "pinned";

/** The pinned workspaces among `workspaces`, newest pin first. */
export function pickPinned<W extends { id: string }>(
	workspaces: readonly W[],
	pinnedAt: Readonly<Record<string, number>>,
): W[] {
	return workspaces
		.filter((workspace) => pinnedAt[workspace.id] !== undefined)
		.sort((a, b) => (pinnedAt[b.id] as number) - (pinnedAt[a.id] as number));
}

export type PinnedEntry =
	| {
			id: string;
			kind: "host";
			workspace: HostWorkspaceItem;
			projectName: string;
			hostName: string;
			offline: boolean;
	  }
	| {
			id: string;
			kind: "cloud";
			row: CloudWorkspaceRow;
			repoName: string | null;
	  };

/** Pinned rows out of their project, so their detail names where they live. */
export function pinnedRows(
	entries: readonly PinnedEntry[],
	cloudName: string,
): HomeListItem[] {
	return entries.map((entry) =>
		entry.kind === "host"
			? {
					kind: "workspace",
					workspace: entry.workspace,
					detail: `${entry.projectName} · ${entry.hostName}`,
					offline: entry.offline,
				}
			: {
					kind: "cloudRow",
					row: entry.row,
					detail: entry.repoName
						? `${entry.repoName} · ${cloudName}`
						: cloudName,
				},
	);
}

/**
 * Puts a Pinned section, folding like a place, above the list. It takes
 * the list's first-item spacing from whatever led before.
 */
export function withPinnedSection(
	list: readonly HomeListItem[],
	pinned: {
		label: string;
		rows: readonly HomeListItem[];
		attentions: readonly (TerminalAttention | null | undefined)[];
		collapsed: boolean;
	},
): HomeListItem[] {
	if (pinned.rows.length === 0) return [...list];
	const rest = list.map((item, index) =>
		index === 0 && (item.kind === "hostLabel" || item.kind === "sectionLabel")
			? { ...item, first: false }
			: item,
	);
	return [
		{
			kind: "hostLabel",
			placeId: PINNED_PLACE_ID,
			name: pinned.label,
			status: "online",
			first: true,
			collapsible: true,
			collapsed: pinned.collapsed,
			count: pinned.rows.length,
			attention: pinned.collapsed
				? strongestAttention(pinned.attentions)
				: null,
		},
		...(pinned.collapsed ? [] : pinned.rows),
		...rest,
	];
}
