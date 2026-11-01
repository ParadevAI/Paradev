import { useLingui } from "@lingui/react/macro";
import { Stack } from "expo-router";
import { screenLayout, sheetScreenOptions } from "@/lib/navigation";

export default function HomeLayout() {
	const { t } = useLingui();

	return (
		<Stack
			screenLayout={screenLayout}
			screenOptions={{
				headerBackButtonDisplayMode: "minimal",
				headerShadowVisible: false,
			}}
		>
			<Stack.Screen name="index" options={{ title: "" }} />
			<Stack.Screen
				name="search"
				options={sheetScreenOptions({
					title: t({ message: "Search" }),
					sheetAllowedDetents: [1.0],
					sheetGrabberVisible: true,
				})}
			/>
			<Stack.Screen
				name="filter"
				options={sheetScreenOptions({
					headerShown: false,
					sheetAllowedDetents: [1.0],
					sheetGrabberVisible: true,
				})}
			/>
			<Stack.Screen
				name="new-session"
				options={sheetScreenOptions({
					headerShown: false,
					sheetAllowedDetents: [1.0],
					sheetGrabberVisible: true,
				})}
			/>
		</Stack>
	);
}
