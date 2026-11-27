import { PostHogProvider as PHProvider } from "posthog-js/react";
import type React from "react";
import { useEffect, useState } from "react";
import { track } from "renderer/lib/analytics";
import { initPostHog, posthog } from "renderer/lib/posthog";
import { postHogIdentity } from "renderer/lib/posthog-identity";
import { isTelemetryEnabled } from "renderer/lib/telemetry";

interface PostHogProviderProps {
	children: React.ReactNode;
}

export function PostHogProvider({ children }: PostHogProviderProps) {
	const [isInitialized, setIsInitialized] = useState(false);

	useEffect(() => {
		try {
			initPostHog();
			postHogIdentity.start(isTelemetryEnabled());
			track("desktop_opened");
		} catch (error) {
			console.error("[posthog] Failed to initialize:", error);
		} finally {
			setIsInitialized(true);
		}
	}, []);

	if (!isInitialized) {
		return null;
	}

	return <PHProvider client={posthog}>{children}</PHProvider>;
}
