import { View } from "react-native";
import type { GlassSurfaceComponent } from "./GlassSurface.types";

const GLASS = {
	backgroundColor: "rgba(30,30,30,0.6)",
	borderColor: "rgba(255,255,255,0.1)",
	borderWidth: 1,
	backdropFilter: "blur(20px) saturate(180%)",
	boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
};

export const GlassSurface: GlassSurfaceComponent = ({
	radius,
	style,
	children,
}) => <View style={[GLASS, { borderRadius: radius }, style]}>{children}</View>;
