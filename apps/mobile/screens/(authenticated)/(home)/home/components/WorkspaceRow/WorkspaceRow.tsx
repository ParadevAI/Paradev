import { useLingui } from "@lingui/react/macro";
import type { SelectGithubPullRequest } from "@superset/db/schema";
import { i18n } from "@superset/i18n";
import { useFormat } from "@superset/i18n/react";
import { useRouter } from "expo-router";
import { View } from "react-native";
import { RowLink } from "@/components/RowLink";
import { Text } from "@/components/ui/text";
import type {
	HostWorkspaceItem,
	HostWorkspacesCacheOps,
} from "@/hooks/useHostWorkspaces";
import { useTheme } from "@/hooks/useTheme";
import { cn } from "@/lib/utils";
import { AgentMark } from "@/screens/(authenticated)/(home)/new-session/agent";
import { usePinnedWorkspacesStore } from "@/screens/(authenticated)/stores/pinnedWorkspacesStore";
import {
	PULL_REQUEST_STATUS,
	pullRequestStatus,
} from "@/screens/(authenticated)/workspace/[id]/utils/pullRequest";
import { useAttentionLabel } from "../../hooks/useAttentionLabel";
import type {
	TerminalAttention,
	TerminalRowData,
} from "../../hooks/useHostTerminals";
import type { DiffStats } from "../../hooks/useVisibleDiffStats";
import type { GroupBarSpan } from "../../types";
import { rowDetailParts } from "../RowDetailLine";
import { WorkspaceLead } from "../WorkspaceLead";
import { WorkspaceRowFrame } from "../WorkspaceRowFrame";
import {
	WorkspaceRowMenu,
	type WorkspaceRowMenuProps,
} from "./components/WorkspaceRowMenu";
import { useWorkspaceMove } from "./hooks/useWorkspaceMove";
import { useWorkspaceRowActions } from "./hooks/useWorkspaceRowActions";

const MAX_SESSION_MARKS = 3;

export function WorkspaceRow({
	workspace,
	pullRequest,
	diffStats,
	cache,
	attention,
	sessions,
	onCopied,
	card = false,
	groups,
	group,
	detail,
	disabled = false,
	separator = false,
	stateInLabel = false,
}: {
	workspace: HostWorkspaceItem;
	pullRequest?: SelectGithubPullRequest;
	diffStats: DiffStats | null;
	cache: HostWorkspacesCacheOps;
	attention?: TerminalAttention | null;
	sessions: TerminalRowData[];
	/** Copy ID landed on the pasteboard; the screen shows its "Copied" notice. */
	onCopied: () => void;
	/** A cell of Home's wide grid rather than a row indented under its project. */
	card?: boolean;
	groups?: WorkspaceRowMenuProps["groups"];
	/** Set for a row inside a group: its colour and piece of the group's bar. */
	group?: { color: string | null; bar: GroupBarSpan | null };
	/** Replaces the branch in the detail line, e.g. "project · host" outside its project. */
	detail?: string;
	disabled?: boolean;
	separator?: boolean;
	stateInLabel?: boolean;
}) {
	const { t } = useLingui();
	const attentionLabel = useAttentionLabel();
	const router = useRouter();
	const theme = useTheme();
	const { formatNumber } = useFormat();
	const prIcon = pullRequest
		? PULL_REQUEST_STATUS[pullRequestStatus(pullRequest)]
		: null;
	const {
		renameWorkspace,
		deleteWorkspace,
		copyId,
		shareWorkspace,
		isUnread,
		toggleUnread,
	} = useWorkspaceRowActions(workspace, cache, sessions, undefined, onCopied);
	const move = useWorkspaceMove(workspace, cache, false);
	// A manual mark reads as `review` — desktop's rollup ranks it lowest, so
	// any live status the sessions are reporting keeps the slot.
	const rowAttention = attention ?? (isUnread ? "review" : null);
	const pinned = usePinnedWorkspacesStore(
		(state) => workspace.id in state.pinnedAt,
	);
	const togglePin = usePinnedWorkspacesStore((state) => state.togglePin);

	const state = rowAttention ?? null;
	const detailParts = rowDetailParts({
		state: state ? attentionLabel(state) : null,
		pullRequest:
			prIcon && pullRequest
				? { label: i18n._(prIcon.label), ink: prIcon.ink }
				: null,
		diff: diffStats,
		name: workspace.name,
		branch: workspace.branch,
		context: detail,
		omitState: stateInLabel,
		noChanges: t({ message: "No changes" }),
	});

	const href = `/workspace/${workspace.id}`;

	return (
		<RowLink href={href}>
			<WorkspaceRowMenu
				// Deleting a local workspace retires the record and leaves the
				// checkout alone, so every row on a host is deletable.
				canRename
				canDelete
				isCloud={false}
				isUnread={isUnread}
				onToggleUnread={toggleUnread}
				pinned={pinned}
				onTogglePin={() => togglePin(workspace.id)}
				onRename={() => void renameWorkspace()}
				onDelete={deleteWorkspace}
				onCopyId={copyId}
				onShare={shareWorkspace}
				link={{ href, onCopied }}
				move={move}
				groups={groups}
			>
				<WorkspaceRowFrame
					lead={
						<WorkspaceLead
							attention={rowAttention}
							creating={false}
							failed={false}
							pullRequest={
								prIcon && pullRequest
									? {
											icon: prIcon.icon,
											ink: prIcon.ink,
											label: t({
												message: `Pull request #${pullRequest.prNumber}`,
											}),
											onPress: () =>
												router.push(
													`/(authenticated)/workspace/${workspace.id}/pull-request/${pullRequest.prNumber}`,
												),
										}
									: null
							}
						/>
					}
					name={workspace.name}
					detailParts={detailParts}
					trailing={
						sessions.length > 0 ? (
							<View className="flex-row items-center">
								{sessions.slice(0, MAX_SESSION_MARKS).map((session, index) => (
									<View
										key={session.terminalId}
										className={cn(
											"bg-secondary size-6 items-center justify-center rounded-full",
											index > 0 && "-ml-2",
										)}
									>
										<AgentMark
											agentId={session.agentId ?? ""}
											size={12}
											color={theme.mutedForeground}
										/>
									</View>
								))}
								{sessions.length > MAX_SESSION_MARKS ? (
									<Text className="text-muted-foreground pl-1 text-[14px] tabular-nums">
										+{formatNumber(sessions.length - MAX_SESSION_MARKS)}
									</Text>
								) : null}
							</View>
						) : null
					}
					card={card}
					grouped={group !== undefined}
					bar={group?.bar ?? null}
					separator={separator}
					onPress={() => router.navigate(`/(authenticated)${href}`)}
					disabled={disabled}
					accessibilityLabel={[
						workspace.name,
						...detailParts.map((part) => part.text),
					].join(", ")}
					phLabel="workspace-row"
				/>
			</WorkspaceRowMenu>
		</RowLink>
	);
}
