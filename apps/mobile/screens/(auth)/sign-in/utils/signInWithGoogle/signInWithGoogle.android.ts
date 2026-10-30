import { GoogleCredential } from "@superset/google-credential";
import * as Crypto from "expo-crypto";
import { signIn } from "@/lib/auth/client";
import { env } from "@/lib/env";
import { signInInBrowser } from "../signInInBrowser";
import { signInSocial } from "../signInSocial";

/**
 * The Credential Manager account sheet. Falls back to the browser when the
 * device has no Google account or the app has no web client ID to ask for.
 */
export async function signInWithGoogle(): Promise<void> {
	const serverClientId = env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
	if (!serverClientId) return signInInBrowser("google");

	const nonce = Crypto.randomUUID();
	let token: string;
	try {
		token = await GoogleCredential.getIdToken(serverClientId, nonce);
	} catch (err) {
		const code = (err as { code?: unknown } | null)?.code;
		if (code === "ERR_CANCELED") return;
		if (code === "ERR_NO_CREDENTIAL") return signInInBrowser("google");
		throw err;
	}
	await signInSocial(signIn.social, {
		provider: "google",
		idToken: { token, nonce },
		callbackURL: "/",
	});
}
