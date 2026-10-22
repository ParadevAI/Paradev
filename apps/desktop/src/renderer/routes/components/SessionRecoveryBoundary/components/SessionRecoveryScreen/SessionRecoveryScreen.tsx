import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { Spinner } from "@superset/ui/spinner";
import { useState } from "react";

interface SessionRecoveryScreenProps {
	timedOut: boolean;
	onRetry: () => Promise<void>;
	onSignOut: () => Promise<void>;
}

export function SessionRecoveryScreen({
	timedOut,
	onRetry,
	onSignOut,
}: SessionRecoveryScreenProps) {
	const { t } = useLingui();
	const [isSigningOut, setIsSigningOut] = useState(false);

	return (
		<section
			aria-label={t({ message: "Restoring your session" })}
			className="relative flex h-screen w-screen flex-col items-center justify-center gap-4 bg-background"
		>
			<div className="drag absolute inset-x-0 top-0 h-12" />
			<Spinner className="size-8" />
			{timedOut && (
				<>
					<div className="text-center select-text cursor-text">
						<h2 className="text-lg font-medium">
							<Trans>Still restoring your session</Trans>
						</h2>
						<p className="text-sm text-muted-foreground">
							<Trans>
								Superset can't confirm your sign-in with the server.
							</Trans>
						</p>
					</div>
					<div className="flex gap-2">
						<Button
							variant="outline"
							size="sm"
							onClick={async () => {
								try {
									await onRetry();
								} catch (error) {
									console.warn("[auth] session recovery retry failed", error);
								}
							}}
						>
							<Trans>Retry</Trans>
						</Button>
						<Button
							variant="outline"
							size="sm"
							disabled={isSigningOut}
							onClick={async () => {
								setIsSigningOut(true);
								try {
									await onSignOut();
								} catch (error) {
									console.warn(
										"[auth] session recovery sign-out failed",
										error,
									);
								} finally {
									setIsSigningOut(false);
								}
							}}
						>
							<Trans>Sign out</Trans>
						</Button>
					</div>
				</>
			)}
		</section>
	);
}
