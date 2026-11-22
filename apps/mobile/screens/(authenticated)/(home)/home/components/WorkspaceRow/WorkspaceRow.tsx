import { useLingui } from "@lingui/react/macro";
import type { SelectGithubPullRequest } from "@superset/db/schema";
import { isLiveCloudWorkspaceStatus } from "@superset/shared/cloud-workspace-status";
import { useRouter } from "expo-router";
import { Pressable, View } from "react-native";
import { RowLink } from "@/components/RowLink";
import { Text } from "@/components/ui/text";
import type { CloudWorkspaceStatus } from "@/hooks/useCloudWorkspaceItems";
import { useEnlargedText } from "@/hooks/useEnlargedText";
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
import { WorkspaceLead } from "./components/WorkspaceLead";
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
	cloudStatus,
	onCopied,
	card = false,
	groups,
	inGroup = false,
}: {
	workspace: HostWorkspaceItem;
	pullRequest?: SelectGithubPullRequest;
	diffStats: DiffStats | null;
	cache: HostWorkspacesCacheOps;
	attention?: TerminalAttention | null;
	sessions: TerminalRowData[];
	/** Set for a cloud workspace; drives the row's pending/failed treatment. */
	cloudStatus?: CloudWorkspaceStatus;
	/** Copy ID landed on the pasteboard; the screen shows its "Copied" notice. */
	onCopied: () => void;
	/** A cell of Home's wide grid rather than a row indented under its project. */
	card?: boolean;
	groups?: WorkspaceRowMenuProps["groups"];
	inGroup?: boolean;
}) {
	const { t } = useLingui();
	const enlargedText = useEnlargedText();
	const attentionLabel = useAttentionLabel();
	const router = useRouter();
	const theme = useTheme();
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
	} = useWorkspaceRowActions(workspace, cache, sessions, cloudStatus, onCopied);
	const move = useWorkspaceMove(workspace, cache, cloudStatus !== undefined);
	// A manual mark reads as `review` — desktop's rollup ranks it lowest, so
	// any live status the sessions are reporting keeps the slot.
	const rowAttention = attention ?? (isUnread ? "review" : null);
	const pinned = usePinnedWorkspacesStore(
		(state) => workspace.id in state.pinnedAt,
	);
	const togglePin = usePinnedWorkspacesStore((state) => state.togglePin);

	const grouped = !card && inGroup;

	const href = `/workspace/${workspace.id}`;

	return (
		<RowLink href={href}>
			<WorkspaceRowMenu
				// A sandbox that doesn't exist yet has nothing to rename or delete; a
				// failed one only needs disposing of. Deleting a local workspace
				// retires the record and leaves the checkout alone, so every row on
				// a host is deletable.
				canRename={
					cloudStatus === undefined || isLiveCloudWorkspaceStatus(cloudStatus)
				}
				canDelete={cloudStatus === undefined || cloudStatus !== "provisioning"}
				isCloud={cloudStatus !== undefined}
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
				{/* Default press behavior on purpose: the system context-menu lift
			    owns the hold animation, and custom press feedback fights it. */}
				<Pressable
					className={cn(
						"bg-background web:hover:bg-accent/60 flex-row items-center gap-3 rounded-xl pr-3",
						card ? "py-3 pl-3" : "min-h-12 py-2.5",
						!card && (grouped ? "pl-7" : "pl-3"),
					)}
					onPress={() => router.navigate(`/(authenticated)${href}`)}
					accessibilityRole="button"
					accessibilityLabel={[
						workspace.name,
						cloudStatus === "failed"
							? attentionLabel("failed")
							: cloudStatus === "provisioning"
								? t({ message: "Creating the sandbox" })
								: rowAttention
									? attentionLabel(rowAttention)
									: null,
					]
						.filter(Boolean)
						.join(", ")}
					ph-label="workspace-row"
				>
					<WorkspaceLead
						attention={rowAttention}
						creating={cloudStatus === "provisioning"}
						failed={cloudStatus === "failed"}
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
					<View className="flex-1">
						<Text
							className="font-medium text-[16px]"
							numberOfLines={enlargedText ? undefined : 1}
						>
							{workspace.name}
						</Text>
						<View
							className={cn(
								"flex-row items-center gap-1",
								enlargedText && "flex-wrap",
							)}
						>
							{/* A workspace named after its branch says it twice otherwise —
						    common now that every project shows its `main`. */}
							{workspace.branch === workspace.name ? null : (
								<Text
									className="text-muted-foreground shrink text-[13px]"
									numberOfLines={enlargedText ? undefined : 1}
								>
									{workspace.branch}
								</Text>
							)}
							{diffStats &&
							(diffStats.additions > 0 || diffStats.deletions > 0) ? (
								<>
									{workspace.branch === workspace.name ? null : (
										<Text className="text-muted-foreground text-[13px]">•</Text>
									)}
									<Text className="text-muted-foreground font-mono text-[13px]">
										+{diffStats.additions} −{diffStats.deletions}
									</Text>
								</>
							) : null}
						</View>
					</View>
					{sessions.length > 0 ? (
						// Overlapping avatar-style stack — stays ~fixed-width as sessions
						// grow instead of eating the row.
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
								<Text className="text-muted-foreground pl-1 text-[11px]">
									+{sessions.length - MAX_SESSION_MARKS}
								</Text>
							) : null}
						</View>
					) : null}
				</Pressable>
			</WorkspaceRowMenu>
		</RowLink>
	);
}
