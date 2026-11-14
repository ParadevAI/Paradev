import type { NativeStackNavigationOptions } from "expo-router";
import { Platform } from "react-native";

export const titledScreenOptions: NativeStackNavigationOptions = {
	headerShadowVisible: false,
};

// iPad shows a form sheet as a fixed-size centered card, so a partial detent
// only shrinks the card and clips what is inside it.
export const sheetDetents = (phoneDetents: number[]) =>
	Platform.OS === "ios" && Platform.isPad ? [1.0] : phoneDetents;
