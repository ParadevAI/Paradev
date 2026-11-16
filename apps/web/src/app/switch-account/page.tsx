import { msg } from "@lingui/core/macro";
import { auth } from "@superset/auth/server";
import type { Metadata } from "next";
import { headers } from "next/headers";
import Image from "next/image";
import { redirect } from "next/navigation";
import { connectSignInContext } from "@/app/utils/connectSignInContext";
import { resolveCallbackUrl } from "@/app/utils/resolveCallbackUrl";
import { env } from "@/env";
import { initServerI18n } from "@/lib/i18n-server";
import { SwitchAccountActions } from "./components/SwitchAccountActions";

export const metadata: Metadata = {
	robots: { index: false, follow: false },
};

export default async function SwitchAccountPage({
	searchParams,
}: {
	searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
	const params = await searchParams;
	const redirectParam =
		typeof params.redirect === "string" ? params.redirect : null;
	const continueUrl = resolveCallbackUrl({
		redirect: redirectParam,
		webUrl: env.NEXT_PUBLIC_WEB_URL,
		trustedOrigins: [env.NEXT_PUBLIC_API_URL],
	});
	const signInUrl = `/sign-in?${new URLSearchParams({ redirect: continueUrl })}`;

	const session = await auth.api.getSession({ headers: await headers() });
	if (!session) redirect(signInUrl);

	const i18n = await initServerI18n();
	const connectorName = connectSignInContext({
		redirect: redirectParam,
		reason: null,
		apiUrl: env.NEXT_PUBLIC_API_URL,
	})?.connectorName;
	const email = session.user.email;

	return (
		<div className="relative flex min-h-screen flex-col">
			<header className="container mx-auto px-6 py-6">
				<a href={env.NEXT_PUBLIC_MARKETING_URL}>
					<Image
						src="/title.svg"
						alt="Paradev"
						width={140}
						height={24}
						priority
					/>
				</a>
			</header>
			<main className="flex flex-1 items-center justify-center px-4">
				<div className="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-[380px]">
					<div className="flex flex-col space-y-2 text-center">
						<h1 className="text-2xl font-semibold tracking-tight">
							{connectorName
								? i18n._({
										...msg({
											message: "Switch account to connect {connectorName}",
										}),
										values: { connectorName },
									})
								: i18n._(msg({ message: "Switch account" }))}
						</h1>
						<p className="text-muted-foreground text-sm">
							{i18n._({
								...msg({
									message:
										"You are signed in as {email}. This account is not a member of the organization this link is for. Sign in with an account in that organization to continue.",
								}),
								values: { email },
							})}
						</p>
					</div>
					<SwitchAccountActions signInUrl={signInUrl} />
				</div>
			</main>
		</div>
	);
}
