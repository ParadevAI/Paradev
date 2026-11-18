import { useWindowDimensions } from "react-native";

export function useEnlargedText(): boolean {
	return useWindowDimensions().fontScale > 1;
}
