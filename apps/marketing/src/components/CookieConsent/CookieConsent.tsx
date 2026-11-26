"use client";

import { Trans } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { AnimatePresence, m } from "framer-motion";
import Link from "next/link";
import { useEffect, useState } from "react";

import {
	type ConsentChoice,
	canTrack,
	readConsentChoice,
	readConsentRegion,
	saveConsentChoice,
} from "@/lib/analytics/consent";
import type { ConsentRegion } from "@/lib/analytics/consent-region";
import { declineAnalytics } from "@/lib/analytics/decline";
import { withPosthog } from "@/lib/analytics/lazy";
import { OPEN_COOKIE_SETTINGS_EVENT } from "./constants";

function storedChoice(): ConsentChoice | null {
	try {
		return readConsentChoice();
	} catch {
		return null;
	}
}

export function CookieConsent() {
	const [showBanner, setShowBanner] = useState(false);
	const [region, setRegion] = useState<ConsentRegion>("opt-in");

	useEffect(() => {
		setRegion(readConsentRegion());
		if (storedChoice() === null) setShowBanner(true);
		const open = () => setShowBanner(true);
		window.addEventListener(OPEN_COOKIE_SETTINGS_EVENT, open);
		return () => window.removeEventListener(OPEN_COOKIE_SETTINGS_EVENT, open);
	}, []);

	const handleAccept = () => {
		saveConsentChoice("accepted");
		setShowBanner(false);
		withPosthog((posthog) => posthog.opt_in_capturing());
	};

	const handleDecline = () => {
		const wasTracking = canTrack();
		withPosthog(declineAnalytics);
		saveConsentChoice("declined");
		setShowBanner(false);
		// Loaded trackers have no teardown API; a reload discards them.
		if (wasTracking) window.location.reload();
	};

	return (
		<AnimatePresence>
			{showBanner && (
				<m.div
					initial={{ y: 20, opacity: 0 }}
					animate={{ y: 0, opacity: 1 }}
					exit={{ y: 20, opacity: 0 }}
					transition={{ type: "spring", damping: 25, stiffness: 300 }}
					className="fixed inset-x-2 bottom-2 z-50 flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2 shadow-lg sm:inset-x-auto sm:bottom-4 sm:left-4 sm:max-w-md"
				>
					<p className="min-w-0 flex-1 text-xs leading-snug text-muted-foreground">
						<Trans>We use cookies for analytics and ad measurement.</Trans>{" "}
						<Link
							href="/privacy"
							className="whitespace-nowrap text-foreground underline underline-offset-2"
						>
							<Trans>Privacy policy</Trans>
						</Link>
					</p>
					<div className="flex shrink-0 gap-2">
						<Button variant="outline" size="sm" onClick={handleDecline}>
							{region === "opt-in" ? (
								<Trans>Decline</Trans>
							) : (
								<Trans>Opt-out</Trans>
							)}
						</Button>
						<Button variant="outline" size="sm" onClick={handleAccept}>
							<Trans>Accept</Trans>
						</Button>
					</div>
				</m.div>
			)}
		</AnimatePresence>
	);
}
