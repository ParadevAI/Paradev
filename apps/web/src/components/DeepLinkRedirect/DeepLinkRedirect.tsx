"use client";

import { Trans } from "@lingui/react/macro";
import { PROTOCOL_SCHEMES } from "@superset/shared/constants";
import { Button } from "@superset/ui/button";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

const BROWSER_FALLBACK_DELAY_MS = 1500;

interface DeepLinkRedirectProps {
	/** Desktop route to open, without a leading slash — e.g. `tasks/my-slug`. */
	path: string;
	/** Same destination in the browser, offered when the desktop app does not open. */
	browserHref?: string;
}

/**
 * Passthrough screen for web routes that only exist to hand a destination to
 * the desktop app. Shareable links point here so a recipient gets a real URL
 * instead of a `superset://` one their chat client won't render.
 */
export function DeepLinkRedirect({ path, browserHref }: DeepLinkRedirectProps) {
	const deepLink = `${PROTOCOL_SCHEMES.PROD}://${path}`;
	const [showBrowserFallback, setShowBrowserFallback] = useState(false);

	useEffect(() => {
		window.location.href = deepLink;
		const timer = setTimeout(
			() => setShowBrowserFallback(true),
			BROWSER_FALLBACK_DELAY_MS,
		);
		return () => clearTimeout(timer);
	}, [deepLink]);

	return (
		<div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
			<div className="flex flex-col items-center gap-6">
				<Image
					src="/title.svg"
					alt="Paradev"
					width={280}
					height={86}
					priority
				/>
				<p className="text-xl text-muted-foreground">
					<Trans>Redirecting to desktop app...</Trans>
				</p>
				<Link
					href={deepLink}
					className="text-sm text-muted-foreground/70 underline decoration-muted-foreground/40 underline-offset-4 transition-colors hover:text-muted-foreground"
				>
					<Trans>Click here if not redirected</Trans>
				</Link>
				{browserHref && showBrowserFallback && (
					<Button variant="outline" asChild>
						<a href={browserHref}>
							<Trans>Continue in browser</Trans>
						</a>
					</Button>
				)}
			</div>
		</div>
	);
}
