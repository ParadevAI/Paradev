import { useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { type WideLayout, wideLayout } from "./wideLayout";

/** Re-reads on every window resize, so folding or unfolding re-lays the screen. */
export function useWideLayout(): WideLayout {
	const window = useWindowDimensions();
	const insets = useSafeAreaInsets();
	return wideLayout(window, insets);
}
