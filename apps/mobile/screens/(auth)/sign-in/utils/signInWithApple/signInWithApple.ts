import { signIn } from "@/lib/auth/client";

export async function signInWithApple(): Promise<void> {
	await signIn.social({ provider: "apple", callbackURL: "/" });
}
