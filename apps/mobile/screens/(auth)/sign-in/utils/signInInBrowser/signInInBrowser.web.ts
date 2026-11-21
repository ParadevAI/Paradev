import { signIn } from "@/lib/auth/client";
import { signInSocial } from "../signInSocial";

// The provider sends the browser back to this page, not to the API's origin.
export async function signInInBrowser(
	provider: "github" | "google",
): Promise<void> {
	await signInSocial(signIn.social, {
		provider,
		callbackURL: `${window.location.origin}${process.env.EXPO_BASE_URL ?? ""}/`,
	});
}
