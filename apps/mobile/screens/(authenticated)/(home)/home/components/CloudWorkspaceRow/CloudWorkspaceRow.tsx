import { useLingui } from "@lingui/react/macro";
import { i18n } from "@superset/i18n";
import { isArchivedCloudWorkspaceStatus } from "@superset/shared/cloud-workspace-status";
import { useRouter } from "expo-router";
import { Pressable, View } from "react-native";
import { RowLink } from "@/components/RowLink";
import { Text } from "@/components/ui/text";
import type { CloudWorkspaceRow as CloudWorkspaceRowData } from "@/hooks/useCloudWorkspaces";
import { useEnlargedText } from "@/hooks/useEnlargedText";
import type { HostWorkspacesCacheOps } from "@/hooks/useHostWorkspaces";
import { cn } from "@/lib/utils";
import { UserAvatar } from "@/screens/(authenticated)/settings/components/UserAvatar";
import { useUnreadWorkspacesStore } from "@/screens/(authenticated)/stores/unreadWorkspacesStore";
import {
	PULL_REQUEST_STATUS,
	pullRequestStatus,
} from "@/screens/(authenticated)/workspace/[id]/utils/pullRequest";
import { useAttentionLabel } from "../../hooks/useAttentionLabel";
import type { CloudPullRequest } from "../../hooks/useCloudPullRequests";
import { cloudRowAttention } from "../../utils/needsMe";
import { RowDetailLine, rowDetailParts } from "../RowDetailLine";
import { RowHairline } from "../RowHairline";
import { WorkspaceLead } from "../WorkspaceLead";
import { ArchivedCloudRowMenu } from "./components/ArchivedCloudRowMenu";
import { CloudWorkspaceRowMenu } from "./components/CloudWorkspaceRowMenu";
import { UnarchiveButton } from "./components/UnarchiveButton";

/**
 * A cloud workspace laid out like a host row: its state (or PR) in the lead
 * slot, the name on the name column, and its creator, if not you, trailing.
 */
export function CloudWorkspaceRow({
	row,
	pullRequest,
	viewerId,
	cache,
	onCopied,
	card = false,
	detail,
	grouped = false,
	separator = false,
}: {
	row: CloudWorkspaceRowData;
	pullRequest?: CloudPullRequest;
	viewerId: string | null;
	cache: HostWorkspacesCacheOps;
	onCopied: () => void;
	/** A cell of Home's wide grid rather than a row of the Cloud list. */
	card?: boolean;
	/** Replaces the branch in the detail line, e.g. "repo · Cloud" outside the Cloud list. */
	detail?: string;
	/** A row inside a group, indented as a host's grouped row. */
	grouped?: boolean;
	/** Draws a hairline under the row. */
	separator?: boolean;
}) {
	const { t } = useLingui();
	const attentionLabel = useAttentionLabel();
	const router = useRouter();
	const enlargedText = useEnlargedText();
	const archived = isArchivedCloudWorkspaceStatus(row.status);
	const readAt = useUnreadWorkspacesStore((state) => state.cloudReadAt[row.id]);
	const manuallyUnread = useUnreadWorkspacesStore(
		(state) => row.id in state.manualUnread,
	);
	const setManualUnread = useUnreadWorkspacesStore(
		(state) => state.setManualUnread,
	);
	const clearManualUnread = useUnreadWorkspacesStore(
		(state) => state.clearManualUnread,
	);
	const markCloudRead = useUnreadWorkspacesStore(
		(state) => state.markCloudRead,
	);
	const isRead =
		!manuallyUnread &&
		(row.agentStatusAt === null ||
			(readAt ?? 0) >= row.agentStatusAt.getTime());
	const isUnread = manuallyUnread || (row.agentStatus === "review" && !isRead);
	const toggleUnread = () => {
		if (!isUnread) {
			setManualUnread(row.id);
			return;
		}
		clearManualUnread(row.id);
		if (row.agentStatusAt) markCloudRead(row.id, row.agentStatusAt.getTime());
	};
	const owner = row.createdBy;
	const isMine = owner !== null && owner.userId === viewerId;
	const prStatus = pullRequest
		? PULL_REQUEST_STATUS[pullRequestStatus(pullRequest)]
		: null;
	const [prOwner, prRepo] = pullRequest?.repoFullName.split("/") ?? [];
	const provisioning = row.status === "provisioning";
	const attention = archived
		? null
		: cloudRowAttention(row, readAt, manuallyUnread);
	const detailParts = rowDetailParts({
		state: attention ? attentionLabel(attention) : null,
		pullRequest:
			prStatus && !archived
				? { label: i18n._(prStatus.label), ink: prStatus.ink }
				: null,
		diff: null,
		name: row.name,
		branch: row.branch,
		context: detail,
		noChanges: t({ message: "No changes" }),
	});

	const body = (
		<Pressable
			className={cn(
				"bg-background min-h-16 flex-row items-center gap-3 rounded-xl py-2",
				card ? "px-3" : cn("pr-4", grouped ? "pl-8" : "pl-4"),
			)}
			onPress={() => router.navigate(`/(authenticated)/workspace/${row.id}`)}
			accessibilityRole="button"
			accessibilityLabel={[
				row.name || t({ message: "Untitled workspace" }),
				...detailParts.map((part) => part.text),
				provisioning ? t({ message: "Creating the sandbox" }) : null,
			]
				.filter(Boolean)
				.join(", ")}
			ph-label="cloud-workspace-row"
		>
			<WorkspaceLead
				attention={attention}
				creating={provisioning}
				failed={false}
				pullRequest={
					prStatus && pullRequest && !archived
						? {
								icon: prStatus.icon,
								ink: prStatus.ink,
								label: t({
									message: `Pull request #${pullRequest.number}`,
								}),
								onPress: () =>
									router.push(
										`/(authenticated)/workspace/${row.id}/pull-request/${pullRequest.number}?owner=${encodeURIComponent(prOwner ?? "")}&repo=${encodeURIComponent(prRepo ?? "")}`,
									),
							}
						: null
				}
			/>
			<View className="min-w-0 flex-1">
				<Text
					className={cn("text-[16px]", archived && "text-muted-foreground")}
					numberOfLines={enlargedText ? undefined : 1}
				>
					{row.name || t({ message: "Untitled workspace" })}
				</Text>
				<RowDetailLine parts={detailParts} />
			</View>
			{archived ? (
				<UnarchiveButton workspaceId={row.id} />
			) : owner && !isMine ? (
				<UserAvatar
					name={owner.name}
					image={owner.image}
					className="size-[18px]"
					textClassName="text-[7px]"
				/>
			) : null}
			{separator && !card ? <RowHairline grouped={grouped} /> : null}
		</Pressable>
	);

	return (
		<RowLink href={`/workspace/${row.id}`}>
			{archived ? (
				<ArchivedCloudRowMenu row={row} cache={cache} onCopied={onCopied}>
					{body}
				</ArchivedCloudRowMenu>
			) : (
				<CloudWorkspaceRowMenu
					row={row}
					cache={cache}
					isUnread={isUnread}
					onToggleUnread={toggleUnread}
					onCopied={onCopied}
				>
					{body}
				</CloudWorkspaceRowMenu>
			)}
		</RowLink>
	);
}
