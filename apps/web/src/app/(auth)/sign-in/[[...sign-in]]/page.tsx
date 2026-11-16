import { env } from "@/env";
import { SignInForm } from "./components/SignInForm";
import { connectSignInContext } from "./utils/connectSignInContext";

export default async function SignInPage({
	searchParams,
}: {
	searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
	const { redirect, reason } = await searchParams;
	const connect = connectSignInContext({
		redirect: typeof redirect === "string" ? redirect : null,
		reason: typeof reason === "string" ? reason : null,
		apiUrl: env.NEXT_PUBLIC_API_URL,
	});

	return <SignInForm connect={connect} />;
}
