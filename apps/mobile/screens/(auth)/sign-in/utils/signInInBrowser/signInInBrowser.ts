import { signIn } from "@/lib/auth/client";
import { signInSocial } from "../signInSocial";

export async function signInInBrowser(
	provider: "github" | "google",
): Promise<void> {
	await signInSocial(signIn.social, { provider, callbackURL: "/" });
}
