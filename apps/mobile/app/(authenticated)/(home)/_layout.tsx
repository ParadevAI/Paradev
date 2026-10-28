import { useLingui } from "@lingui/react/macro";
import { Stack } from "expo-router";
import { sideSafeAreaLayout } from "@/lib/navigation";

export default function HomeLayout() {
	const { t } = useLingui();

	return (
		<Stack
			screenOptions={{
				headerBackButtonDisplayMode: "minimal",
				headerShadowVisible: false,
			}}
			screenLayout={sideSafeAreaLayout}
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
