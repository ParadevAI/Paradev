"use client";

import { Trans } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { AnimatePresence, m } from "framer-motion";
import Link from "next/link";
import { useEffect, useState } from "react";

import { declineAnalytics } from "@/lib/analytics/decline";
import { withPosthog } from "@/lib/analytics/lazy";
import { ANALYTICS_CONSENT_KEY } from "@/lib/constants";

export function CookieConsent() {
	const [showBanner, setShowBanner] = useState(false);

	useEffect(() => {
		const consent = localStorage.getItem(ANALYTICS_CONSENT_KEY);
		if (consent === null) {
			setShowBanner(true);
		}
	}, []);

	const handleAccept = () => {
		localStorage.setItem(ANALYTICS_CONSENT_KEY, "accepted");
		setShowBanner(false);
		withPosthog((posthog) => posthog.opt_in_capturing());
	};

	const handleOptOut = () => {
		localStorage.setItem(ANALYTICS_CONSENT_KEY, "declined");
		withPosthog(declineAnalytics);
		setShowBanner(false);
		// The external tracker has no teardown API; discard its listeners and timers.
		window.location.reload();
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
						<Trans>
							We only collect analytics cookies so we can improve your
							experience.
						</Trans>{" "}
						<Link
							href="/privacy"
							className="whitespace-nowrap text-foreground underline underline-offset-2"
						>
							<Trans>Privacy policy</Trans>
						</Link>
					</p>
					<div className="flex shrink-0 gap-2">
						<Button variant="outline" size="sm" onClick={handleOptOut}>
							<Trans>Opt-out</Trans>
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
