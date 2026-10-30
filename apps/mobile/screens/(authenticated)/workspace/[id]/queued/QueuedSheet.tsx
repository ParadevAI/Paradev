import { useLingui } from "@lingui/react/macro";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect } from "react";
import { ScrollView } from "react-native";
import { HeaderToolbar } from "@/lib/navigation";
import { useActiveChat } from "../stores/activeChatStore";
import { QueuedPrompts } from "./components/QueuedPrompts";

export function QueuedSheet() {
	const { t } = useLingui();
	const router = useRouter();
	const { session } = useLocalSearchParams<{ session?: string }>();
	const {
		queued,
		queuePaused,
		queueControls,
		steerQueued,
		removeQueued,
		resumeQueue,
	} = useActiveChat(session);

	useEffect(() => {
		if (queued.length === 0 && router.canGoBack()) router.back();
	}, [queued.length, router]);

	return (
		<>
			<Stack.Screen options={{ title: t({ message: "Queued messages" }) }} />
			<HeaderToolbar placement="left">
				<HeaderToolbar.Button
					accessibilityLabel={t({ message: "Close" })}
					icon="close"
					onPress={() => router.back()}
				/>
			</HeaderToolbar>
			<ScrollView
				className="bg-background flex-1"
				contentContainerClassName="px-4 pb-10 pt-2"
				contentInsetAdjustmentBehavior="automatic"
			>
				<QueuedPrompts
					actionable={queueControls}
					onRemove={removeQueued}
					onResume={resumeQueue}
					onSteer={(itemId) => {
						steerQueued(itemId);
						router.back();
					}}
					paused={queuePaused}
					prompts={queued}
				/>
			</ScrollView>
		</>
	);
}
