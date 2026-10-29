import { signIn } from "@/lib/auth/client";

export async function signInWithApple(): Promise<void> {
	const res = await signIn.social({ provider: "apple", callbackURL: "/" });
	if (res.error) throw new Error(res.error.message);
}
