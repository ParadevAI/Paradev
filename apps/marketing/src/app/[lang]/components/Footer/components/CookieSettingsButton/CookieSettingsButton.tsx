"use client";

import { Trans } from "@lingui/react/macro";

import { OPEN_COOKIE_SETTINGS_EVENT } from "@/components/CookieConsent";

export function CookieSettingsButton() {
	return (
		<button
			type="button"
			onClick={() =>
				window.dispatchEvent(new Event(OPEN_COOKIE_SETTINGS_EVENT))
			}
			className="cursor-pointer text-sm text-muted-foreground transition-colors hover:text-foreground"
		>
			<Trans>Cookie settings</Trans>
		</button>
	);
}
