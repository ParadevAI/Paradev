import MaskedViewClass from "@react-native-masked-view/masked-view";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import type { ComponentType, ReactElement } from "react";
import { StyleSheet, View, type ViewProps } from "react-native";
import { useTheme } from "@/hooks/useTheme";

// masked-view 0.3.2 types its class on `NativeMethods`, which react-native 0.88 no longer exports.
const MaskedView = MaskedViewClass as unknown as ComponentType<
	ViewProps & { maskElement: ReactElement }
>;

/** Blurs and fades clamped content into the page rather than cutting it mid-word. */
export function FadeOut({ height }: { height: number }) {
	const theme = useTheme();
	return (
		<View
			pointerEvents="none"
			style={{ position: "absolute", left: 0, right: 0, bottom: 0, height }}
		>
			<MaskedView
				maskElement={
					<LinearGradient
						colors={["transparent", "black"]}
						style={StyleSheet.absoluteFill}
					/>
				}
				style={StyleSheet.absoluteFill}
			>
				<BlurView intensity={40} style={StyleSheet.absoluteFill} tint="dark" />
			</MaskedView>
			<LinearGradient
				colors={["transparent", theme.background]}
				style={StyleSheet.absoluteFill}
			/>
		</View>
	);
}
