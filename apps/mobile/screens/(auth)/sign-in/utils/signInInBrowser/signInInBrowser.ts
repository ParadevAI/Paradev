import { signIn } from "@/lib/auth/client";

export async function signInInBrowser(
	provider: "github" | "google",
): Promise<void> {
	await signIn.social({ provider, callbackURL: "/" });
}
