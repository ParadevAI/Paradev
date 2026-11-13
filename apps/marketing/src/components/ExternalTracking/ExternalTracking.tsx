"use client";

import Script from "next/script";
import { useEffect, useState } from "react";

import { hasDeclinedAnalytics } from "@/lib/analytics/consent";
import { installExternalTrackingConsentGuard } from "@/lib/analytics/external-tracking";
import { ANALYTICS_CONSENT_KEY } from "@/lib/constants";

export function ExternalTracking() {
	const [enabled, setEnabled] = useState(false);

	useEffect(() => {
		installExternalTrackingConsentGuard();
		setEnabled(!hasDeclinedAnalytics());

		const onStorage = (event: StorageEvent) => {
			if (
				event.key === ANALYTICS_CONSENT_KEY &&
				event.newValue === "declined"
			) {
				window.location.reload();
			}
		};
		window.addEventListener("storage", onStorage);
		return () => window.removeEventListener("storage", onStorage);
	}, []);

	if (!enabled) return null;

	return (
		<Script
			id="paradev-external-tracking"
			src="https://x.paradev.com/js/external-tracking.js"
			data-tracking-id="tk_7cd75fb5e34042539263f0d7e1a98b57"
			strategy="afterInteractive"
		/>
	);
}
