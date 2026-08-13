import Ionicons from "@expo/vector-icons/Ionicons";
import { COMPANY } from "@superset/shared/constants";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Alert, Linking, View } from "react-native";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { useDeleteAccount } from "@/hooks/useDeleteAccount";
import { useSignOut } from "@/hooks/useSignOut";
import { useTheme } from "@/hooks/useTheme";
import { authClient, useSession } from "@/lib/auth/client";
import { apiClient } from "@/lib/trpc/client";

export function PaywallScreen() {
	const theme = useTheme();
	const { data: session, refetch } = useSession();
	const { signOut, isSigningOut } = useSignOut();
	const { deleteAccount, isDeleting } = useDeleteAccount();
	const [isSwitching, setIsSwitching] = useState(false);

	const activeOrganizationId = session?.session.activeOrganizationId;
	const { data: organizations } = useQuery({
		queryKey: ["paywall", "organizations"],
		queryFn: () => apiClient.user.myOrganizations.query(),
	});
	const otherOrganizations = (organizations ?? []).filter(
		(organization) => organization.id !== activeOrganizationId,
	);

	const handleSwitchOrganization = async (organizationId: string) => {
		setIsSwitching(true);
		try {
			await authClient.organization.setActive({ organizationId });
			await refetch();
		} catch (error) {
			console.error("[paywall] Failed to switch organization:", error);
		} finally {
			setIsSwitching(false);
		}
	};

	const handleDeleteAccount = () => {
		Alert.alert(
			"Delete account?",
			"All of your data will be permanently deleted after 30 days — sign back in before then to restore your account.",
			[
				{ style: "cancel", text: "Cancel" },
				{
					style: "destructive",
					text: "Delete account",
					onPress: () => {
						deleteAccount().catch(() => {
							Alert.alert(
								"Could not delete account",
								"Something went wrong. Try again, or contact support@superset.sh.",
							);
						});
					},
				},
			],
		);
	};

	return (
		<View className="flex-1 items-center justify-center gap-6 bg-background p-6">
			<View
				className="size-16 items-center justify-center rounded-full"
				style={{ backgroundColor: theme.muted }}
			>
				<Ionicons name="lock-closed" size={32} color={theme.foreground} />
			</View>

			<View className="items-center gap-2">
				<Text className="text-2xl font-semibold text-foreground">
					Superset Mobile is part of Pro
				</Text>
				<Text className="text-center text-base text-muted-foreground">
					Manage your plan from the Superset desktop app, then refresh.
				</Text>
			</View>

			<View className="w-full items-center gap-3">
				{otherOrganizations.map((organization) => (
					<Button
						key={organization.id}
						variant="outline"
						size="lg"
						className="w-4/5"
						onPress={
							isSwitching
								? undefined
								: () => void handleSwitchOrganization(organization.id)
						}
					>
						<Text>{`Switch to ${organization.name}`}</Text>
					</Button>
				))}
				<Button size="lg" className="w-4/5" onPress={() => void refetch()}>
					<Text>Refresh</Text>
				</Button>
				<Button
					variant="outline"
					size="lg"
					className="w-4/5"
					onPress={() => Linking.openURL(COMPANY.MAIL_TO)}
				>
					<Text>Contact support</Text>
				</Button>
				<Button
					variant="ghost"
					size="lg"
					className="w-4/5"
					onPress={isSigningOut ? undefined : () => void signOut()}
				>
					<Text>Log out</Text>
				</Button>
			</View>

			<Text
				className="text-sm text-destructive underline"
				onPress={isDeleting ? undefined : handleDeleteAccount}
			>
				Delete account
			</Text>
		</View>
	);
}
