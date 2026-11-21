import { useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { type HomeGrid, homeGrid } from "./homeGrid";

export function useHomeGrid(): HomeGrid | null {
	return homeGrid(useWindowDimensions(), useSafeAreaInsets());
}
