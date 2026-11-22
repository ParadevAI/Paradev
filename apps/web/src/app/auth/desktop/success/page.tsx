import { msg } from "@lingui/core/macro";
import { auth } from "@superset/auth/server";
import { db } from "@superset/db/client";
import { sessions } from "@superset/db/schema/auth";
import { BRAND } from "@superset/shared/brand";
import { headers } from "next/headers";
import { initServerI18n } from "@/lib/i18n-server";
import { DesktopAuthCard } from "./components/DesktopAuthCard";
import { DesktopRedirect } from "./components/DesktopRedirect";
import {
	isDesktopProtocol,
	parseLoopbackCallback,
} from "./utils/desktopCallbackTarget";

export default async function DesktopSuccessPage({
	searchParams,
}: {
	searchParams: Promise<{
		desktop_state?: string;
		desktop_protocol?: string;
		desktop_local_callback?: string;
	}>;
}) {
	const i18n = await initServerI18n();
	const appName = BRAND.NAME;
	const signInFailed = (
		<DesktopAuthCard
			title={i18n._(msg({ message: "Sign-in didn't finish" }))}
			description={i18n._(
				msg({ message: `Go back to ${appName} and sign in again.` }),
			)}
		/>
	);

	const {
		desktop_state: state,
		desktop_protocol = "superset",
		desktop_local_callback: localCallbackBase,
	} = await searchParams;

	if (!state) {
		return signInFailed;
	}

	let session: Awaited<ReturnType<typeof auth.api.getSession>> | null = null;
	try {
		session = await auth.api.getSession({ headers: await headers() });
	} catch (error) {
		console.error("Failed to get session for desktop auth:", error);
		return signInFailed;
	}

	if (!session) {
		return signInFailed;
	}

	// The token below goes wherever these point, so refuse anything that is
	// not the desktop app before minting it.
	const localCallback = localCallbackBase
		? parseLoopbackCallback(localCallbackBase)
		: undefined;
	if (
		!isDesktopProtocol(desktop_protocol) ||
		(localCallbackBase && !localCallback)
	) {
		return signInFailed;
	}

	// Desktop and web need independent sessions with separate activeOrganizationId
	const headersObj = await headers();
	const userAgent = headersObj.get("user-agent") || "Paradev Desktop App";
	const ipAddress =
		headersObj.get("x-forwarded-for")?.split(",")[0] ||
		headersObj.get("x-real-ip") ||
		undefined;

	const crypto = await import("node:crypto");
	const token = crypto.randomBytes(32).toString("base64url");
	const now = new Date();
	const expiresAt = new Date(Date.now() + 60 * 60 * 24 * 30 * 1000);

	await db.insert(sessions).values({
		token,
		userId: session.user.id,
		expiresAt,
		ipAddress,
		userAgent,
		activeOrganizationId: session.session.activeOrganizationId,
		updatedAt: now,
	});
	const desktopUrl = `${desktop_protocol}://auth/callback?token=${encodeURIComponent(token)}&expiresAt=${encodeURIComponent(expiresAt.toISOString())}&state=${encodeURIComponent(state)}`;
	let localCallbackUrl: string | undefined;
	if (localCallback) {
		localCallback.searchParams.set("token", token);
		localCallback.searchParams.set("expiresAt", expiresAt.toISOString());
		localCallback.searchParams.set("state", state);
		localCallbackUrl = localCallback.toString();
	}

	return (
		<DesktopRedirect url={desktopUrl} localCallbackUrl={localCallbackUrl} />
	);
}
