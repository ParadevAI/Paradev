import { StyleSheet, View } from "react-native";
import type { GlassSurfaceComponent } from "./GlassSurface.types";

const SURFACE = "hsl(0 0% 12%)";
const OUTLINE = "rgba(255,255,255,0.08)";

export const GlassSurface: GlassSurfaceComponent = ({
	radius,
	style,
	children,
}) => (
	<View
		style={[
			{
				borderRadius: radius,
				backgroundColor: SURFACE,
				borderColor: OUTLINE,
				borderWidth: StyleSheet.hairlineWidth,
				elevation: 3,
			},
			style,
		]}
	>
		{children}
	</View>
);
