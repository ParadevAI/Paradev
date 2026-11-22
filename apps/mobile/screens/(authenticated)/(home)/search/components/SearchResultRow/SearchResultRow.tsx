import { useLingui } from "@lingui/react/macro";
import { View } from "react-native";
import { RowLink } from "@/components/RowLink";
import type { HostWorkspaceItem } from "@/hooks/useHostWorkspaces";
import { rowDetailParts } from "@/screens/(authenticated)/(home)/home/components/RowDetailLine";
import { WorkspaceLead } from "@/screens/(authenticated)/(home)/home/components/WorkspaceLead";
import { WorkspaceRowFrame } from "@/screens/(authenticated)/(home)/home/components/WorkspaceRowFrame";
import { useAttentionLabel } from "@/screens/(authenticated)/(home)/home/hooks/useAttentionLabel";
import type { TerminalAttention } from "@/screens/(authenticated)/(home)/home/hooks/useHostTerminals";
import { placeDetail } from "@/screens/(authenticated)/(home)/utils/placeDetail";

/** A search result in Home's row layout; an offline host's result is dimmed and does not open. */
export function SearchResultRow({
	workspace,
	placeName,
	projectName,
	attention,
	creating,
	separator,
	unreachable,
	onOpen,
}: {
	workspace: HostWorkspaceItem;
	placeName: string;
	projectName: string | null;
	attention: TerminalAttention | null;
	creating: boolean;
	separator: boolean;
	unreachable: boolean;
	onOpen: () => void;
}) {
	const { t } = useLingui();
	const attentionLabel = useAttentionLabel();
	const detailParts = rowDetailParts({
		state: attention ? attentionLabel(attention) : null,
		pullRequest: null,
		diff: null,
		name: workspace.name,
		branch: workspace.branch,
		context: placeDetail({ placeName, projectName }),
		noChanges: t({ message: "No changes" }),
	});
	return (
		<RowLink href={`/workspace/${workspace.id}`}>
			<View className={unreachable ? "opacity-50" : undefined}>
				<WorkspaceRowFrame
					lead={
						<WorkspaceLead
							attention={attention}
							creating={creating}
							failed={false}
						/>
					}
					name={workspace.name}
					detailParts={detailParts}
					separator={separator}
					onPress={onOpen}
					disabled={unreachable}
					accessibilityLabel={[
						workspace.name,
						...detailParts.map((part) => part.text),
					].join(", ")}
					phLabel="search-workspace-row"
				/>
			</View>
		</RowLink>
	);
}
