import { signInInBrowser } from "../signInInBrowser";

export async function signInWithGoogle(): Promise<void> {
	await signInInBrowser("google");
}
