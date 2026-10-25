"use client";

import { Trans } from "@lingui/react/macro";
import { BRAND } from "@superset/shared/brand";
import { useEffect, useState } from "react";
import { DesktopAuthCard } from "../DesktopAuthCard";

const HAND_OFF_DELAY_MS = 2500;

export function DesktopRedirect({
	url,
	localCallbackUrl,
}: {
	url: string;
	localCallbackUrl?: string;
}) {
	const [handedOff, setHandedOff] = useState(false);
	const target = localCallbackUrl ?? url;
	const appName = BRAND.NAME;

	useEffect(() => {
		// Full-page navigation, not fetch: browsers block mixed-content subresources, not navigations.
		window.location.href = target;

		const markHandedOff = () => setHandedOff(true);
		const timer = window.setTimeout(markHandedOff, HAND_OFF_DELAY_MS);
		window.addEventListener("blur", markHandedOff);
		return () => {
			window.clearTimeout(timer);
			window.removeEventListener("blur", markHandedOff);
		};
	}, [target]);

	return (
		<DesktopAuthCard
			title={<Trans>You're signed in</Trans>}
			description={
				handedOff ? (
					<Trans>You can close this tab.</Trans>
				) : (
					<Trans>Opening {appName}…</Trans>
				)
			}
		>
			<a
				href={target}
				className="text-sm text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground"
			>
				<Trans>Open {appName}</Trans>
			</a>
		</DesktopAuthCard>
	);
}
