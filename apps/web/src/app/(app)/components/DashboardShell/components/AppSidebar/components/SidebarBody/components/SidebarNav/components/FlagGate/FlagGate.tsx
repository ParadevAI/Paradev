"use client";

import type { ReactNode } from "react";
import {
	type FeatureFlags,
	useFeatureFlag,
} from "../../../../../../../../../../providers/FeatureFlagsProvider";

export function FlagGate({
	flag,
	children,
}: {
	flag: keyof FeatureFlags;
	children: ReactNode;
}) {
	return useFeatureFlag(flag) ? children : null;
}
