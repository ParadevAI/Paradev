import { Trans } from "@lingui/react/macro";
import { type AuthProvider, COMPANY } from "@superset/shared/constants";
import {
	DEV_EMAIL,
	DEV_NAME,
	DEV_PASSWORD,
} from "@superset/shared/dev-credentials";
import { Badge } from "@superset/ui/badge";
import { Button } from "@superset/ui/button";
import { Spinner } from "@superset/ui/spinner";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { FaGithub } from "react-icons/fa";
import { FcGoogle } from "react-icons/fc";
import { Redirect } from "renderer/components/Redirect";
import { env } from "renderer/env.renderer";
import { useDelayElapsed } from "renderer/hooks/useDelayElapsed";
import { track } from "renderer/lib/analytics";
import { setAuthToken } from "renderer/lib/auth-client";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { SupersetLogo } from "./components/SupersetLogo";
import { useSessionRecovery } from "./hooks/useSessionRecovery";

export const Route = createFileRoute("/sign-in/")({
	component: SignInPage,
});

const LAST_USED_METHOD_KEY = "superset-last-auth-method";

const workspaceRedirect = <Redirect to="/workspace" replace />;

const SESSION_PENDING_TIMEOUT_MS = 15_000;

type AuthMethod = AuthProvider | "dev";

function readLastUsedMethod(): AuthMethod | null {
	const stored = window.localStorage.getItem(LAST_USED_METHOD_KEY);
	return stored === "github" || stored === "google" || stored === "dev"
		? stored
		: null;
}

function SignInPage() {
	const signInMutation = electronTrpc.auth.signIn.useMutation();
	const persistToken = electronTrpc.auth.persistToken.useMutation();
	const navigate = useNavigate();
	const [isLoadingDev, setIsLoadingDev] = useState(false);
	const [devError, setDevError] = useState<string | null>(null);
	const [lastUsedMethod, setLastUsedMethod] = useState(readLastUsedMethod);
	const [browserProvider, setBrowserProvider] = useState<AuthProvider | null>(
		null,
	);
	const { hasLocalToken, isPending, session } = useSessionRecovery();
	// A session fetch that never settles must not trap the user on a spinner —
	// fall through to the sign-in buttons after a while (#5729).
	const pendingTimedOut = useDelayElapsed(
		isPending,
		SESSION_PENDING_TIMEOUT_MS,
	);

	// Dev bypass: skip sign-in entirely
	if (env.SKIP_ENV_VALIDATION) {
		return workspaceRedirect;
	}

	// Show loading while session is being fetched
	if (isPending && !pendingTimedOut) {
		return (
			<div className="flex h-screen w-screen items-center justify-center bg-background">
				<Spinner className="size-8" />
			</div>
		);
	}

	// If already signed in, redirect to workspace
	if (session?.user) {
		return workspaceRedirect;
	}

	const rememberLastUsedMethod = (method: AuthMethod) => {
		window.localStorage.setItem(LAST_USED_METHOD_KEY, method);
		setLastUsedMethod(method);
	};

	const signIn = (provider: AuthProvider) => {
		track("auth_started", { provider });
		rememberLastUsedMethod(provider);
		setBrowserProvider(provider);
		signInMutation.mutate({ provider });
	};

	const signInAsDev = async () => {
		setIsLoadingDev(true);
		setDevError(null);
		rememberLastUsedMethod("dev");

		const postAuth = async (path: string, body: Record<string, unknown>) => {
			const response = await fetch(`${env.NEXT_PUBLIC_API_URL}${path}`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				credentials: "omit",
				body: JSON.stringify(body),
			});
			const data = (await response.json().catch(() => ({}))) as {
				token?: string;
				code?: string;
				message?: string;
			};
			return { ok: response.ok, status: response.status, data };
		};

		try {
			let result = await postAuth("/api/auth/sign-in/email", {
				email: DEV_EMAIL,
				password: DEV_PASSWORD,
			});
			if (!result.ok && result.data.code === "INVALID_EMAIL_OR_PASSWORD") {
				const signUp = await postAuth("/api/auth/sign-up/email", {
					email: DEV_EMAIL,
					password: DEV_PASSWORD,
					name: DEV_NAME,
				});
				if (!signUp.ok) {
					throw new Error(
						signUp.data.message ?? `Sign-up failed (${signUp.status})`,
					);
				}
				result = await postAuth("/api/auth/sign-in/email", {
					email: DEV_EMAIL,
					password: DEV_PASSWORD,
				});
			}
			if (!result.ok) {
				throw new Error(
					result.data.message ?? `Sign-in failed (${result.status})`,
				);
			}
			const token = result.data.token;
			if (!token) throw new Error("Sign-in did not return a token");
			const expiresAt = new Date(
				Date.now() + 1000 * 60 * 60 * 24 * 30,
			).toISOString();
			await persistToken.mutateAsync({ token, expiresAt });
			setAuthToken(token);
			await navigate({ to: "/workspace", replace: true });
		} catch (error) {
			setDevError(
				error instanceof Error ? error.message : "Dev sign-in failed",
			);
			setIsLoadingDev(false);
		}
	};

	const providerButtons = [
		{
			provider: "github" as const,
			icon: <FaGithub />,
			label: <Trans>Continue with GitHub</Trans>,
		},
		{
			provider: "google" as const,
			icon: <FcGoogle />,
			label: <Trans>Continue with Google</Trans>,
		},
	];

	const browserOpenFailed =
		signInMutation.isError || signInMutation.data?.success === false;
	const isWaitingForBrowser = browserProvider !== null && !browserOpenFailed;
	const browserProviderLabel =
		browserProvider === "google" ? "Google" : "GitHub";

	return (
		<div className="flex h-full w-full flex-col bg-background">
			<div className="drag h-12 w-full shrink-0" />

			<div className="flex flex-1 items-center justify-center pb-[8vh]">
				<div className="flex w-full max-w-xs flex-col items-center px-4">
					<h1 className="mb-3">
						<SupersetLogo
							className="h-6 w-auto"
							gradient={isWaitingForBrowser}
						/>
					</h1>

					{isWaitingForBrowser ? (
						<>
							<p className="text-sm font-medium text-foreground">
								<Trans>Continue in your browser</Trans>
							</p>
							<p className="mt-1 mb-6 text-balance text-center text-sm text-muted-foreground">
								<Trans>
									Sign in with {browserProviderLabel}, then come back here.
								</Trans>
							</p>
							<div className="flex w-full flex-col gap-2">
								<Button
									variant="outline"
									className="w-full"
									onClick={() => browserProvider && signIn(browserProvider)}
									disabled={signInMutation.isPending}
								>
									<Trans>Open browser again</Trans>
								</Button>
								<Button
									variant="ghost"
									className="w-full text-muted-foreground"
									onClick={() => setBrowserProvider(null)}
								>
									<Trans>Back</Trans>
								</Button>
							</div>
						</>
					) : (
						<>
							<p className="mb-6 text-sm text-muted-foreground">
								{hasLocalToken ? (
									<Trans>Restoring your session</Trans>
								) : (
									<Trans>Welcome to Superset</Trans>
								)}
							</p>

							<div className="flex w-full flex-col gap-3">
								{providerButtons.map(({ provider, icon, label }) => (
									<div key={provider} className="relative">
										<Button
											variant="outline"
											onClick={() => signIn(provider)}
											className="w-full"
											disabled={signInMutation.isPending}
										>
											{icon}
											{label}
										</Button>
										{lastUsedMethod === provider && (
											<Badge
												variant="outline"
												className="pointer-events-none absolute -top-2 -right-2 border-link/40 bg-[color-mix(in_oklab,var(--link)_15%,var(--background))] px-1.5 py-0 text-[10px] text-link"
											>
												<Trans>Last used</Trans>
											</Badge>
										)}
									</div>
								))}
							</div>
							{browserOpenFailed && (
								<p className="mt-3 text-xs text-destructive">
									<Trans>Couldn't open your browser. Try again.</Trans>
								</p>
							)}

							{env.NODE_ENV === "development" && (
								<div className="mt-6 flex w-full flex-col gap-2 border-t pt-6">
									<Button
										variant="ghost"
										size="sm"
										onClick={signInAsDev}
										className="w-full text-muted-foreground"
										disabled={isLoadingDev}
									>
										{isLoadingDev
											? "Signing in..."
											: "Sign in as Local Admin (dev)"}
									</Button>
									{devError && (
										<p className="cursor-text select-text text-center text-xs text-destructive">
											{devError}
										</p>
									)}
								</div>
							)}
						</>
					)}
				</div>
			</div>

			<p className="mx-auto max-w-md shrink-0 text-balance px-4 pb-6 text-center text-xs text-muted-foreground">
				<Trans>
					By signing in, you agree to our{" "}
					<a
						href={COMPANY.TERMS_URL}
						target="_blank"
						rel="noopener noreferrer"
						className="underline underline-offset-2 transition-colors hover:text-foreground"
					>
						Terms of Service
					</a>{" "}
					and{" "}
					<a
						href={COMPANY.PRIVACY_URL}
						target="_blank"
						rel="noopener noreferrer"
						className="underline underline-offset-2 transition-colors hover:text-foreground"
					>
						Privacy Policy
					</a>
				</Trans>
			</p>
		</div>
	);
}
