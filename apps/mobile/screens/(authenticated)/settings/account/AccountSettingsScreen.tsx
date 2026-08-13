import Ionicons from "@expo/vector-icons/Ionicons";
import { ACCOUNT_DELETION_GRACE_DAYS } from "@superset/shared/constants";
import { Alert, ScrollView, View } from "react-native";
import { Text } from "@/components/ui/text";
import { useDeleteAccount } from "@/hooks/useDeleteAccount";
import { useTheme } from "@/hooks/useTheme";
import { useSession } from "@/lib/auth/client";
import { ListRow } from "@/screens/(authenticated)/components/ListRow";
import { ListRowValue } from "@/screens/(authenticated)/components/ListRowValue";
import { UserAvatar } from "../components/UserAvatar";

export function AccountSettingsScreen() {
	const theme = useTheme();
	const { data: session } = useSession();
	const user = session?.user;
	const { deleteAccount, isDeleting } = useDeleteAccount();

	const handleDeleteAccount = () => {
		Alert.alert(
			"Delete account?",
			`All of your data will be permanently deleted after ${ACCOUNT_DELETION_GRACE_DAYS} days — sign back in before then to restore your account.`,
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
		<ScrollView
			className="bg-background flex-1"
			contentContainerClassName="px-6 pb-12"
		>
			<View className="items-center gap-2 py-8">
				<UserAvatar
					name={user?.name ?? "?"}
					image={user?.image}
					className="size-16"
					textClassName="text-lg"
				/>
				<Text
					className="text-lg font-semibold"
					style={{ color: theme.foreground }}
				>
					{user?.name}
				</Text>
				<Text className="text-sm" style={{ color: theme.mutedForeground }}>
					{user?.email}
				</Text>
			</View>
			<ListRow
				label="Name"
				trailing={<ListRowValue value={user?.name ?? ""} chevron={false} />}
			/>
			<ListRow
				label="Email"
				trailing={<ListRowValue value={user?.email ?? ""} chevron={false} />}
				isLast
			/>
			<View className="my-2 h-px" style={{ backgroundColor: theme.border }} />
			<ListRow
				icon={
					<Ionicons name="trash-outline" size={20} color={theme.destructive} />
				}
				label="Delete account"
				destructive
				onPress={isDeleting ? undefined : handleDeleteAccount}
				isLast
			/>
		</ScrollView>
	);
}
