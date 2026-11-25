import { useLingui } from "@lingui/react/macro";
import { Stack } from "expo-router";
import {
	ParentScreens,
	screenLayout,
	sheetScreenOptions,
} from "@/lib/navigation";

const NO_PARENTS: string[] = [];

export default function HomeLayout() {
	const { t } = useLingui();

	return (
		<Stack
			screenLayout={screenLayout}
			layout={({ state, navigation, children }) => (
				<ParentScreens
					state={state}
					navigation={navigation}
					parents={NO_PARENTS}
					root="index"
				>
					{children}
				</ParentScreens>
			)}
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
