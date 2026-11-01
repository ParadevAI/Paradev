import { useRef } from "react";
import type { ViewInstance } from "react-native";
import type { UseHorizontalWheel } from "./useHorizontalWheel.types";

export const useHorizontalWheel: UseHorizontalWheel = () =>
	useRef<ViewInstance | null>(null);
