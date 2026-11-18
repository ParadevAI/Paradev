import { Trans, useLingui } from "@lingui/react/macro";
import { CloudOff } from "lucide-react-native";
import { useEffect } from "react";
import { Pressable, View } from "react-native";
import { Text } from "@/components/ui/text";
import { recordUpgradeIntent, useUpgrade } from "@/lib/upgrade";
import { WorkspacePlaceholder } from "../WorkspacePlaceholder";

/** A cloud workspace that billing refused to start. */
export function CloudRefusalPlaceholder({
	message,
	onRetry,
	refreshing,
	onRefresh,
}: {
	message: string;
	onRetry: () => void;
	refreshing: boolean;
	onRefresh: () => void;
}) {
	const { t } = useLingui();
	const { isResolved, canManagePlan, openBillingSettings } = useUpgrade();

	useEffect(() => {
		if (isResolved && !canManagePlan) recordUpgradeIntent("cloud-workspaces");
	}, [isResolved, canManagePlan]);

	return (
		<WorkspacePlaceholder
			action={
				<View className="flex-row gap-2">
					<Pressable
						accessibilityRole="button"
						className="bg-secondary h-[38px] flex-row items-center justify-center gap-1.5 rounded-md px-5 active:opacity-80"
						onPress={onRetry}
					>
						<Text className="font-medium text-[15px]">
							<Trans>Try again</Trans>
						</Text>
					</Pressable>
					{canManagePlan ? (
						<Pressable
							accessibilityRole="button"
							className="bg-primary h-[38px] flex-row items-center justify-center gap-1.5 rounded-md px-5 active:opacity-80"
							onPress={openBillingSettings}
						>
							<Text className="text-primary-foreground font-medium text-[15px]">
								<Trans>Manage plan</Trans>
							</Text>
						</Pressable>
					) : null}
				</View>
			}
			body={message}
			icon={CloudOff}
			onRefresh={onRefresh}
			refreshing={refreshing}
			title={t({ message: "This cloud workspace can't start" })}
		/>
	);
}
