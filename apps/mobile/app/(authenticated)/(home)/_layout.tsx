import { useLingui } from "@lingui/react/macro";
import { Stack } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function HomeLayout() {
	const { t } = useLingui();
	const insets = useSafeAreaInsets();

	return (
		<Stack
			screenOptions={{
				headerBackButtonDisplayMode: "minimal",
				headerShadowVisible: false,
				contentStyle: { paddingLeft: insets.left, paddingRight: insets.right },
			}}
		>
			<Stack.Screen name="index" options={{ title: "" }} />
			<Stack.Screen
				name="search"
				options={{
					presentation: "formSheet",
					title: t({ message: "Search" }),
					sheetAllowedDetents: [1.0],
					sheetGrabberVisible: true,
				}}
			/>
			<Stack.Screen
				name="filter"
				options={{
					presentation: "formSheet",
					headerShown: false,
					sheetAllowedDetents: [1.0],
					sheetGrabberVisible: true,
				}}
			/>
			<Stack.Screen
				name="new-session"
				options={{
					presentation: "formSheet",
					headerShown: false,
					sheetAllowedDetents: [1.0],
					sheetGrabberVisible: true,
				}}
			/>
		</Stack>
	);
}
