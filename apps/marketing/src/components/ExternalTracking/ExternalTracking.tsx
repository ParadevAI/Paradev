"use client";

import { usePathname, useSearchParams } from "next/navigation";
import Script from "next/script";
import { useEffect, useState } from "react";

import { hasDeclinedAnalytics } from "@/lib/analytics/consent";
import {
	installExternalTrackingConsentGuard,
	trackExternalPageView,
} from "@/lib/analytics/external-tracking-runtime";
import { ANALYTICS_CONSENT_KEY } from "@/lib/constants";

export function ExternalTracking() {
	const [enabled, setEnabled] = useState(false);
	const pathname = usePathname();
	const search = useSearchParams().toString();

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

	useEffect(() => {
		if (
			pathname === window.location.pathname &&
			search === new URLSearchParams(window.location.search).toString()
		)
			trackExternalPageView();
	}, [pathname, search]);

	if (!enabled) return null;

	return (
		<Script
			id="paradev-external-tracking"
			src="https://x.paradev.com/js/external-tracking.js"
			data-tracking-id="tk_7cd75fb5e34042539263f0d7e1a98b57"
			integrity="sha384-eTbSzekd6wFeuaVEJ21PQ4p9x+NmQtov6UTS+5a6v2dPWkqWhKTY1LOQgxjWe69C"
			crossOrigin="anonymous"
			strategy="afterInteractive"
		/>
	);
}
