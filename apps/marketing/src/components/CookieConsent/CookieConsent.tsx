"use client";

import { Trans } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { cn } from "@superset/ui/utils";
import { AnimatePresence, m } from "framer-motion";
import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { declineAnalytics } from "@/lib/analytics/decline";
import { withPosthog } from "@/lib/analytics/lazy";
import { ANALYTICS_CONSENT_KEY } from "@/lib/constants";

/** Elements the banner must never cover, such as the hero download buttons. */
export const KEEP_CLEAR_ATTRIBUTE = "data-cookie-banner-keep-clear";

// Tried in order; the first one that leaves every keep-clear element
// uncovered wins. A browser window is often smaller than the screen, so no
// single fixed position is safe: on a 1000x560 Safari window a bottom bar
// covers the hero CTA, and on a phone a corner card does.
const PLACEMENTS = [
	{
		name: "corner-left",
		container: "bottom-4 left-4 w-72 flex-col items-stretch",
		compact: false,
	},
	{
		name: "corner-right",
		container: "bottom-4 right-4 w-72 flex-col items-stretch",
		compact: false,
	},
	{
		name: "bar",
		container: "inset-x-4 bottom-4 flex-col sm:flex-row sm:items-center",
		compact: false,
	},
	{
		name: "compact-right",
		container: "bottom-2 right-2 flex-row items-center",
		compact: true,
	},
	{
		name: "compact-left",
		container: "bottom-2 left-2 flex-row items-center",
		compact: true,
	},
] as const;

function overlaps(a: DOMRect, b: DOMRect): boolean {
	return (
		a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
	);
}

function coversKeepClear(banner: HTMLElement): boolean {
	// Measure where the banner sits once its entrance animation ends.
	const rect = banner.getBoundingClientRect();
	const offsetY = Number.parseFloat(
		getComputedStyle(banner).transform.split(",")[5] ?? "0",
	);
	const settled = new DOMRect(
		rect.x,
		rect.y - (Number.isFinite(offsetY) ? offsetY : 0),
		rect.width,
		rect.height,
	);
	for (const element of document.querySelectorAll(
		`[${KEEP_CLEAR_ATTRIBUTE}]`,
	)) {
		const target = element.getBoundingClientRect();
		if (target.width === 0 || target.height === 0) continue;
		if (overlaps(settled, target)) return true;
	}
	return false;
}

export function CookieConsent() {
	const [showBanner, setShowBanner] = useState(false);
	const [placementIndex, setPlacementIndex] = useState(0);
	const [viewport, setViewport] = useState<string | null>(null);
	const bannerRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const consent = localStorage.getItem(ANALYTICS_CONSENT_KEY);
		if (consent === null) {
			setShowBanner(true);
		}
	}, []);

	// Start over from the preferred placement whenever the window changes size.
	useEffect(() => {
		if (!showBanner) return;
		const onResize = () =>
			setViewport(`${window.innerWidth}x${window.innerHeight}`);
		onResize();
		window.addEventListener("resize", onResize);
		return () => window.removeEventListener("resize", onResize);
	}, [showBanner]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: viewport is the trigger
	useLayoutEffect(() => {
		setPlacementIndex(0);
	}, [viewport]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: re-measure after a resize even when the placement stays the same
	useLayoutEffect(() => {
		const banner = bannerRef.current;
		if (!showBanner || !banner) return;
		if (placementIndex < PLACEMENTS.length - 1 && coversKeepClear(banner)) {
			setPlacementIndex(placementIndex + 1);
		}
	}, [showBanner, placementIndex, viewport]);

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

	const placement = PLACEMENTS[placementIndex] ?? PLACEMENTS[0];

	return (
		<AnimatePresence>
			{showBanner && (
				<m.div
					ref={bannerRef}
					data-placement={placement.name}
					initial={{ y: 20, opacity: 0 }}
					animate={{ y: 0, opacity: 1 }}
					exit={{ y: 20, opacity: 0 }}
					transition={{ type: "spring", damping: 25, stiffness: 300 }}
					className={cn(
						"fixed z-50 flex rounded-lg border border-border bg-card shadow-lg",
						placement.compact ? "gap-2 p-2" : "gap-3 p-3 sm:p-4",
						placement.container,
					)}
				>
					<p
						className={cn(
							"text-muted-foreground",
							placement.compact ? "text-xs" : "text-sm sm:flex-1",
						)}
					>
						{placement.compact ? (
							<Link
								href="/privacy"
								className="font-medium text-foreground underline-offset-4 hover:underline"
							>
								<Trans>Analytics cookies</Trans>
							</Link>
						) : (
							<>
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
							</>
						)}
					</p>
					<div className="grid shrink-0 grid-cols-2 gap-2">
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
