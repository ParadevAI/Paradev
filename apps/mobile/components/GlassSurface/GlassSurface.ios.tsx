import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import { View } from "react-native";
import type { GlassSurfaceComponent } from "./GlassSurface.types";

export const GlassSurface: GlassSurfaceComponent = ({
	radius,
	interactive,
	dark,
	fallbackClassName,
	style,
	children,
}) =>
	isLiquidGlassAvailable() ? (
		<GlassView
			colorScheme={dark ? "dark" : undefined}
			glassEffectStyle="regular"
			isInteractive={interactive}
			style={[{ borderRadius: radius }, style]}
		>
			{children}
		</GlassView>
	) : (
		<View className={fallbackClassName} style={style}>
			{children}
		</View>
	);
