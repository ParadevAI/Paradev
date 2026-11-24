import * as AppleAuthentication from "expo-apple-authentication";
import * as Crypto from "expo-crypto";
import { signIn } from "@/lib/auth/client";
import { signInSocial } from "../signInSocial";

/** Resolves without signing in when the user cancels the system sheet. */
export async function signInWithApple(): Promise<void> {
	// Apple puts SHA256(nonce) in the identity token; the server gets the
	// raw nonce and better-auth compares against the hashed claim.
	const rawNonce = Crypto.randomUUID();
	const hashedNonce = await Crypto.digestStringAsync(
		Crypto.CryptoDigestAlgorithm.SHA256,
		rawNonce,
	);
	let credential: AppleAuthentication.AppleAuthenticationCredential;
	try {
		credential = await AppleAuthentication.signInAsync({
			requestedScopes: [
				AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
				AppleAuthentication.AppleAuthenticationScope.EMAIL,
			],
			nonce: hashedNonce,
		});
	} catch (err) {
		if (
			err instanceof Error &&
			"code" in err &&
			err.code === "ERR_REQUEST_CANCELED"
		) {
			return;
		}
		throw err;
	}
	if (!credential.identityToken) {
		throw new Error("Apple did not return an identity token");
	}
	await signInSocial(signIn.social, {
		provider: "apple",
		idToken: {
			token: credential.identityToken,
			nonce: rawNonce,
			// Apple only sends name/email on the very first authorization
			user: {
				name: {
					firstName: credential.fullName?.givenName ?? undefined,
					lastName: credential.fullName?.familyName ?? undefined,
				},
				email: credential.email ?? undefined,
			},
		},
		callbackURL: "/",
	});
}
