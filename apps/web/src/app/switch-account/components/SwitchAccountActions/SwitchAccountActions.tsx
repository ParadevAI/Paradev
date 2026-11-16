"use client";

import { Trans } from "@lingui/react/macro";
import { authClient } from "@superset/auth/client";
import { Button } from "@superset/ui/button";
import Link from "next/link";
import { useState } from "react";

export function SwitchAccountActions({ signInUrl }: { signInUrl: string }) {
	const [isSwitching, setIsSwitching] = useState(false);

	const switchAccount = async () => {
		setIsSwitching(true);
		try {
			await authClient.signOut();
		} finally {
			window.location.href = signInUrl;
		}
	};

	return (
		<div className="grid gap-3">
			<Button onClick={switchAccount} disabled={isSwitching}>
				{isSwitching ? (
					<Trans>Signing out...</Trans>
				) : (
					<Trans>Sign in with another account</Trans>
				)}
			</Button>
			<Button asChild variant="ghost">
				<Link href="/">
					<Trans>Go to Paradev</Trans>
				</Link>
			</Button>
		</div>
	);
}
