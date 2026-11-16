"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import { authClient } from "@superset/auth/client";
import { Button } from "@superset/ui/button";
import { useState } from "react";

export function SwitchAccount({
	email,
	redirect,
	connectorName,
}: {
	email: string | null;
	redirect: string | null;
	connectorName: string | null;
}) {
	const { t } = useLingui();
	const [isSigningOut, setIsSigningOut] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const signInHref = redirect
		? `/sign-in?redirect=${encodeURIComponent(redirect)}`
		: "/sign-in";

	const signInWithAnotherAccount = async () => {
		setIsSigningOut(true);
		setError(null);
		const result = await authClient.signOut().catch(() => null);
		if (!result || result.error) {
			setError(t({ message: "Could not sign out. Please try again." }));
			setIsSigningOut(false);
			return;
		}
		window.location.assign(signInHref);
	};

	return (
		<div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background p-6">
			<div className="flex max-w-md flex-col gap-2 text-center">
				<h1 className="text-2xl font-semibold tracking-tight">
					{connectorName ? (
						<Trans>Use another account to connect {connectorName}</Trans>
					) : (
						<Trans>Use another account to continue</Trans>
					)}
				</h1>
				<p className="text-muted-foreground text-sm">
					{email ? (
						<Trans>
							You are signed in as {email}. This account is not a member of the
							organization this link is for.
						</Trans>
					) : (
						<Trans>
							Your account is not a member of the organization this link is for.
						</Trans>
					)}
				</p>
				<p className="text-muted-foreground text-sm">
					<Trans>
						Sign in with another account, or ask an admin of the organization to
						invite you.
					</Trans>
				</p>
			</div>
			{error && <p className="text-destructive text-sm">{error}</p>}
			<div className="flex gap-2">
				<Button disabled={isSigningOut} onClick={signInWithAnotherAccount}>
					{isSigningOut ? (
						<Trans>Signing out…</Trans>
					) : (
						<Trans>Sign in with another account</Trans>
					)}
				</Button>
				<Button variant="outline" asChild>
					<a href="/">
						<Trans>Go to Paradev</Trans>
					</a>
				</Button>
			</div>
		</div>
	);
}
