"use client";

import { createContext, type ReactNode, use } from "react";

export interface FeatureFlags {
	cloudUsage: boolean;
}

const FeatureFlagsContext = createContext<Promise<FeatureFlags> | null>(null);

/** `flags` stays a promise so the shell renders without waiting for PostHog. */
export function FeatureFlagsProvider({
	flags,
	children,
}: {
	flags: Promise<FeatureFlags>;
	children: ReactNode;
}) {
	return <FeatureFlagsContext value={flags}>{children}</FeatureFlagsContext>;
}

/** Suspends until the flags resolve; render it inside a Suspense boundary. */
export function useFeatureFlag(flag: keyof FeatureFlags): boolean {
	const flags = use(FeatureFlagsContext);
	if (!flags) throw new Error("useFeatureFlag needs a FeatureFlagsProvider");
	return use(flags)[flag];
}
