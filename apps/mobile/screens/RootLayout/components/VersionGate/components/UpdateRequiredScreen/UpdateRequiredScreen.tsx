import Ionicons from "@expo/vector-icons/Ionicons";
import { Trans, useLingui } from "@lingui/react/macro";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { View } from "react-native";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/hooks/useTheme";
import { appUpdate } from "./utils/appUpdate";

interface UpdateRequiredScreenProps {
	message: string;
	currentVersion: string;
	minimumVersion: string;
}

export function UpdateRequiredScreen({
	message,
	currentVersion,
	minimumVersion,
}: UpdateRequiredScreenProps) {
	const theme = useTheme();
	const { t } = useLingui();

	useEffect(() => {
		void SplashScreen.hideAsync().catch(() => {});
	}, []);

	return (
		<View className="flex-1 items-center justify-center gap-6 bg-background p-6">
			<View
				className="size-16 items-center justify-center rounded-full"
				style={{ backgroundColor: theme.muted }}
			>
				<Ionicons name="arrow-up-circle" size={40} color={theme.primary} />
			</View>

			<View className="items-center gap-2">
				<Text className="text-2xl font-semibold text-foreground">
					<Trans>Update Required</Trans>
				</Text>
				<Text className="text-center text-base text-muted-foreground">
					{appUpdate.message ? t(appUpdate.message) : message}
				</Text>
			</View>

			<View className="items-center gap-1">
				<Text className="text-sm text-muted-foreground">
					<Trans>Your version: {currentVersion}</Trans>
				</Text>
				<Text className="text-sm text-muted-foreground">
					<Trans>Required version: {minimumVersion}+</Trans>
				</Text>
			</View>

			<Button size="lg" className="w-4/5 max-w-sm" onPress={appUpdate.open}>
				<Text>{t(appUpdate.action)}</Text>
			</Button>
		</View>
	);
}
