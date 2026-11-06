import Ionicons from "@expo/vector-icons/Ionicons";
import { Trans, useLingui } from "@lingui/react/macro";
import { BRAND } from "@superset/shared/brand";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useEffect } from "react";
import { AppState, View } from "react-native";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/hooks/useTheme";
import { useSession } from "@/lib/auth/client";
import { useOrganizations } from "@/screens/(authenticated)/hooks/useOrganizations";
import { OrganizationHeaderButton } from "../home/components/OrganizationHeaderButton";

const PLAN_POLL_MS = 10_000;

/** Home content for accounts whose active org has no paid plan. The shell
 * stays fully navigable — the org switcher sheet also carries the Settings
 * entry, so plan changes, org switches, and account deletion all use the
 * normal surfaces. The trpc middleware is the actual wall. */
export function HomePaywallScreen() {
	const { t } = useLingui();
	const appName = BRAND.NAME;
	const theme = useTheme();
	const router = useRouter();
	const { refetch } = useSession();
	const { activeOrganization } = useOrganizations();

	// Paying happens on the web, so the plan flips while this screen is
	// up or backgrounded. iOS freezes timers in the background; the AppState
	// listener is the resume path.
	useEffect(() => {
		const interval = setInterval(() => void refetch(), PLAN_POLL_MS);
		const subscription = AppState.addEventListener("change", (state) => {
			if (state === "active") void refetch();
		});
		return () => {
			clearInterval(interval);
			subscription.remove();
		};
	}, [refetch]);

	return (
		<>
			<OrganizationHeaderButton
				name={activeOrganization?.name}
				logo={activeOrganization?.logo}
				onPress={() => {
					void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
					router.push("/(authenticated)/settings");
				}}
			/>
			<View className="flex-1 items-center justify-center gap-6 bg-background p-6">
				<View
					className="size-16 items-center justify-center rounded-full"
					style={{ backgroundColor: theme.muted }}
				>
					<Ionicons name="lock-closed" size={32} color={theme.foreground} />
				</View>

				<View className="items-center gap-2">
					<Text className="text-2xl font-semibold text-foreground">
						<Trans>{appName} Mobile is part of Pro</Trans>
					</Text>
					<Text className="text-center text-base text-muted-foreground">
						{activeOrganization
							? t({
									message: `${activeOrganization.name} is on the Free plan. ${appName} Mobile is available for organizations on Pro.`,
								})
							: t({
									message: `This organization is on the Free plan. ${appName} Mobile is available for organizations on Pro.`,
								})}
					</Text>
				</View>
			</View>
		</>
	);
}
