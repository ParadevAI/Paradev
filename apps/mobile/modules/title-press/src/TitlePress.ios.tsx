import { requireNativeView } from "expo";
import type { PressableTitle, TitlePressComponent } from "./TitlePress.types";

interface NativeTitlePressProps {
	onTitlePress: () => void;
	style: { width: number; height: number };
}

const NativeTitlePress = requireNativeView<NativeTitlePressProps>("TitlePress");

export const TitlePress: TitlePressComponent = ({ onPress }) => (
	<NativeTitlePress onTitlePress={onPress} style={{ width: 0, height: 0 }} />
);

export const pressableTitle: PressableTitle = () => undefined;
