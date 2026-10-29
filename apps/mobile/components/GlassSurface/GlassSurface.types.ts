import type { ComponentType, ReactNode } from "react";
import type { StyleProp, ViewStyle } from "react-native";

export interface GlassSurfaceProps {
	radius: number;
	/** The surface is a button: it reacts to touch where the OS supports it. */
	interactive?: boolean;
	/** Keeps the material dark whatever is behind it. */
	dark?: boolean;
	/** The look on OS versions that draw no glass but share this platform's design. */
	fallbackClassName: string;
	style?: StyleProp<ViewStyle>;
	children: ReactNode;
}

/** A floating surface over content: glass where the OS draws it. */
export type GlassSurfaceComponent = ComponentType<GlassSurfaceProps>;
