import { useLingui } from "@lingui/react/macro";
import { Redirect, Stack, usePathname } from "expo-router";
import { View } from "react-native";
import { usePrimeRelayUrl } from "@/hooks/usePrimeRelayUrl";
import { useRealtimeNudges } from "@/hooks/useRealtimeNudges";
import { useSession } from "@/lib/auth/client";
import {
	glassHeaderOptions,
	screenLayout,
	sheetDetents,
	sheetHeaderOptions,
	sheetScreenOptions,
} from "@/lib/navigation";
import { VoiceLayer } from "@/screens/(authenticated)/voice/VoiceLayer";

export const unstable_settings = { anchor: "(home)" };

const pageScreenOptions = {
	headerShown: true,
	headerBackButtonDisplayMode: "minimal" as const,
	headerShadowVisible: false,
};

const settingsScreenOptions = (title: string) => ({
	...pageScreenOptions,
	title,
});

export default function AuthenticatedLayout() {
	usePrimeRelayUrl();
	useRealtimeNudges();

	const { t } = useLingui();
	const { data: session } = useSession();
	const pathname = usePathname();

	// Unpaid sessions may only see home (which renders the paywall) and
	// settings — App Review requires sign-out, org switching, and account
	// deletion to stay reachable behind a gate, and settings is the only route
	// to all three. Leaving it out sealed unpaid accounts in: it mounted and
	// was redirected away in the same frame.
	const unpaid = !!session && !session.session.plan;
	if (unpaid && pathname !== "/" && !pathname.startsWith("/settings")) {
		return <Redirect href="/(authenticated)/(home)" />;
	}

	return (
		<View className="flex-1">
			<Stack screenOptions={{ headerShown: false }} screenLayout={screenLayout}>
				{/* Root headers are hidden — `title` here only names routes in
			    back-button long-press menus (otherwise raw route names leak,
			    e.g. "(home)"). */}
				<Stack.Screen
					name="(home)"
					options={{ title: t({ message: "Home" }) }}
				/>
				<Stack.Screen
					name="voice/index"
					options={{
						presentation: "transparentModal",
						animation: "none",
						headerShown: false,
						contentStyle: { backgroundColor: "transparent" },
					}}
				/>
				<Stack.Screen
					name="voice/chat"
					options={sheetScreenOptions({
						sheetAllowedDetents: sheetDetents([0.6, 1.0]),
						sheetGrabberVisible: true,
						...sheetHeaderOptions,
						title: t({ message: "Voice" }),
					})}
				/>
				<Stack.Screen
					name="voice/settings"
					options={sheetScreenOptions({
						sheetAllowedDetents: sheetDetents([0.6]),
						sheetGrabberVisible: true,
						...sheetHeaderOptions,
						title: t({ message: "Voice settings" }),
					})}
				/>
				<Stack.Screen
					name="pages/index"
					options={{ ...pageScreenOptions, title: t({ message: "Pages" }) }}
				/>
				<Stack.Screen
					name="pages/[slug]/index"
					options={{
						...glassHeaderOptions,
						title: "",
						headerBackTitle: t({ message: "Pages" }),
					}}
				/>
				<Stack.Screen
					name="pages/[slug]/preview"
					options={sheetScreenOptions({
						title: "",
						sheetAllowedDetents: sheetDetents([0.6, 1.0]),
						sheetGrabberVisible: true,
						...sheetHeaderOptions,
					})}
				/>
				<Stack.Screen
					name="pages/[slug]/comment"
					options={{
						presentation: "transparentModal",
						headerShown: false,
						animation: "fade",
						contentStyle: { backgroundColor: "transparent" },
					}}
				/>
				<Stack.Screen
					name="pages/[slug]/comments"
					options={sheetScreenOptions({
						headerShown: false,
						sheetAllowedDetents: [1.0],
						sheetGrabberVisible: true,
					})}
				/>
				<Stack.Screen
					name="pages/[slug]/share"
					options={sheetScreenOptions({
						headerShown: false,
						sheetAllowedDetents: [1.0],
						sheetGrabberVisible: true,
					})}
				/>
				<Stack.Screen
					name="workspace/[id]/share"
					options={sheetScreenOptions({
						headerShown: false,
						sheetAllowedDetents: [1.0],
						sheetGrabberVisible: true,
					})}
				/>
				<Stack.Screen
					name="settings/index"
					options={settingsScreenOptions(t({ message: "Settings" }))}
				/>
				<Stack.Screen
					name="settings/organization"
					options={settingsScreenOptions(t({ message: "Organization" }))}
				/>
				<Stack.Screen
					name="settings/hosts"
					options={settingsScreenOptions(t({ message: "Hosts" }))}
				/>
				<Stack.Screen
					name="workspace/[id]/index"
					options={{
						headerShown: true,
						headerBackButtonDisplayMode: "minimal",
						headerShadowVisible: false,
						title: t({ message: "Workspace" }),
					}}
				/>
				<Stack.Screen
					name="workspace/[id]/files-changed"
					options={{
						headerShown: true,
						headerBackButtonDisplayMode: "minimal",
						headerShadowVisible: false,
						title: t({
							message: "Files changed",
						}),
						// The one screen that has to keep this. Its code panes scroll
						// sideways on a PanResponder, and the system gesture beats a JS
						// responder every time — with the swipe on, a drag across a diff
						// pops the screen instead of scrolling it. The cost is that iOS 26
						// leaves this screen with no back swipe at all; a real horizontal
						// ScrollView would earn it back, since UIKit defers to those.
						fullScreenGestureEnabled: false,
					}}
				/>
				<Stack.Screen
					name="workspace/[id]/file"
					options={{ ...glassHeaderOptions, title: "" }}
				/>
				<Stack.Screen
					name="workspace/[id]/commits"
					options={sheetScreenOptions({
						sheetAllowedDetents: sheetDetents([0.75]),
						sheetGrabberVisible: true,
						...sheetHeaderOptions,
						title: t({ message: "Commits" }),
					})}
				/>
				<Stack.Screen
					name="workspace/[id]/line-comment"
					options={sheetScreenOptions({
						sheetAllowedDetents: sheetDetents([0.75]),
						sheetGrabberVisible: true,
						...sheetHeaderOptions,
						title: t({
							message: "Add comment",
						}),
					})}
				/>
				<Stack.Screen
					name="workspace/[id]/finish-review"
					options={sheetScreenOptions({
						sheetAllowedDetents: sheetDetents([0.75]),
						sheetGrabberVisible: true,
						...sheetHeaderOptions,
						title: t({
							message: "Finish review",
						}),
					})}
				/>
				<Stack.Screen
					name="workspace/[id]/actions"
					options={sheetScreenOptions({
						sheetAllowedDetents: [1.0],
						sheetGrabberVisible: true,
						// The workspace name is the sheet's own centred headline, so
						// the bar carries no title — only the native close button.
						...sheetHeaderOptions,
						title: "",
					})}
				/>
				<Stack.Screen
					name="workspace/[id]/sessions"
					options={sheetScreenOptions({
						sheetAllowedDetents: sheetDetents([0.5]),
						sheetGrabberVisible: true,
						...sheetHeaderOptions,
						title: t({ message: "Sessions" }),
					})}
				/>
				<Stack.Screen
					name="workspace/[id]/new-session"
					options={sheetScreenOptions({
						sheetAllowedDetents: sheetDetents([0.5]),
						sheetGrabberVisible: true,
						...sheetHeaderOptions,
						title: t({
							message: "New session",
						}),
					})}
				/>
				<Stack.Screen
					name="workspace/[id]/queued"
					options={sheetScreenOptions({
						sheetAllowedDetents: sheetDetents([0.5, 1.0]),
						sheetGrabberVisible: true,
						...sheetHeaderOptions,
					})}
				/>
				<Stack.Screen
					name="workspace/[id]/activity"
					options={sheetScreenOptions({
						sheetAllowedDetents: sheetDetents([0.6, 1.0]),
						sheetGrabberVisible: true,
						...sheetHeaderOptions,
					})}
				/>
				<Stack.Screen
					name="workspace/[id]/pull-requests"
					options={sheetScreenOptions({
						sheetAllowedDetents: sheetDetents([0.5]),
						sheetGrabberVisible: true,
						...sheetHeaderOptions,
					})}
				/>
				<Stack.Screen
					name="workspace/[id]/pull-request/[pullRequestId]/index"
					options={{
						...glassHeaderOptions,
						title: t({
							message: "Pull request",
						}),
					}}
				/>
				<Stack.Screen
					name="workspace/[id]/pull-request/[pullRequestId]/checks"
					options={sheetScreenOptions({
						sheetAllowedDetents: sheetDetents([0.75]),
						sheetGrabberVisible: true,
						...sheetHeaderOptions,
					})}
				/>
				<Stack.Screen
					name="workspace/[id]/pull-request/[pullRequestId]/reviewers"
					options={sheetScreenOptions({
						sheetAllowedDetents: sheetDetents([0.5]),
						sheetGrabberVisible: true,
						...sheetHeaderOptions,
					})}
				/>
				<Stack.Screen
					name="workspace/[id]/pull-request/[pullRequestId]/check"
					options={sheetScreenOptions({
						sheetAllowedDetents: sheetDetents([0.6]),
						sheetGrabberVisible: true,
						...sheetHeaderOptions,
					})}
				/>
				<Stack.Screen
					name="workspace/[id]/jump-to-file"
					options={sheetScreenOptions({
						sheetAllowedDetents: sheetDetents([0.75]),
						sheetGrabberVisible: true,
						...sheetHeaderOptions,
						title: t({
							message: "Jump to file",
						}),
					})}
				/>
			</Stack>
			<VoiceLayer />
		</View>
	);
}
