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
	};

	return (
		<AnimatePresence>
			{showBanner && (
				<m.div
					initial={{ y: 20, opacity: 0 }}
					animate={{ y: 0, opacity: 1 }}
					exit={{ y: 20, opacity: 0 }}
					transition={{ type: "spring", damping: 25, stiffness: 300 }}
					className="fixed inset-x-4 bottom-4 z-50 flex flex-col gap-3 rounded-lg border border-border bg-card p-3 shadow-lg sm:flex-row sm:items-center sm:p-4 lg:inset-x-auto lg:left-4 lg:w-72 lg:flex-col lg:items-stretch"
				>
					<p className="text-sm text-muted-foreground sm:flex-1">
						<Trans>
							We only collect analytics cookies so we can improve your
							experience.
						</Trans>{" "}
						<Link
							href="/privacy"
							className="font-medium text-foreground underline-offset-4 hover:underline"
						>
							<Trans>Privacy policy</Trans>
						</Link>
					</p>
					<div className="grid grid-cols-2 gap-2 sm:shrink-0">
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
