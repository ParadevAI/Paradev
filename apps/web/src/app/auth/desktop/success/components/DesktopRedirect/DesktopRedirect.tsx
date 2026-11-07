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
	const [status, setStatus] = useState<"opening" | "opened" | "not-opened">(
		"opening",
	);
	const target = localCallbackUrl ?? url;
	const appName = BRAND.NAME;

	useEffect(() => {
		// Full-page navigation, not fetch: browsers block mixed-content subresources, not navigations.
		window.location.href = target;

		const markOpened = () => setStatus("opened");
		const timer = window.setTimeout(() => {
			setStatus((current) =>
				current === "opening" && document.hasFocus() ? "not-opened" : current,
			);
		}, HAND_OFF_DELAY_MS);
		window.addEventListener("blur", markOpened);
		return () => {
			window.clearTimeout(timer);
			window.removeEventListener("blur", markOpened);
		};
	}, [target]);

	return (
		<DesktopAuthCard
			title={<Trans>You're signed in</Trans>}
			description={
				status === "opened" ? (
					<Trans>You can close this tab.</Trans>
				) : status === "not-opened" ? (
					<Trans>Didn't open? Use the link below.</Trans>
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
