import type { ComponentType } from "react";

export interface TitlePressProps {
	onPress: () => void;
}

/** Reports taps on the enclosing native stack screen's title. */
export type TitlePressComponent = ComponentType<TitlePressProps>;
