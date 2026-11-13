import { Trans } from "@lingui/react/macro";
import { useFormat } from "@superset/i18n/react";
import { View } from "react-native";
import { Text } from "@/components/ui/text";
import type { HostWorkspaceRow } from "@/lib/host-service/client";
import type { ChangesetCheckout } from "../../../hooks/useWorkspaceChangeset";

export function WorkspaceCheckouts({
	checkouts,
	changes,
}: {
	checkouts: HostWorkspaceRow["checkouts"];
	changes: ChangesetCheckout[];
}) {
	const { formatNumber } = useFormat();
	if (checkouts.length < 2) return null;
	const changesById = new Map(
		changes.map((checkout) => [checkout.repositoryId, checkout]),
	);

	return (
		<View>
			<Text className="text-muted-foreground mt-9 pb-1 text-[15px]">
				<Trans>Repositories</Trans>
			</Text>
			{checkouts.map((checkout, index) => {
				const change = changesById.get(checkout.repositoryId);
				return (
					<View
						key={checkout.repositoryId}
						className={
							index === checkouts.length - 1
								? "flex-row items-center gap-3 py-3.5"
								: "border-border/60 flex-row items-center gap-3 border-b py-3.5"
						}
					>
						<View className="min-w-0 flex-1">
							<Text className="text-[15px] font-medium" numberOfLines={1}>
								{checkout.name}
							</Text>
							<Text
								className="text-muted-foreground text-[13px]"
								numberOfLines={1}
							>
								{checkout.branch}
							</Text>
						</View>
						{change && change.files.length > 0 ? (
							<View className="flex-row items-center gap-1.5">
								<Text className="text-green-500 font-medium text-[13px]">
									+{formatNumber(change.additions)}
								</Text>
								<Text className="text-red-500 font-medium text-[13px]">
									−{formatNumber(change.deletions)}
								</Text>
							</View>
						) : null}
					</View>
				);
			})}
		</View>
	);
}
