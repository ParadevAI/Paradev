import { env } from "@/env";
import { SignInForm } from "./components/SignInForm";
import { connectSignInContext } from "./utils/connectSignInContext";

export default async function SignInPage({
	searchParams,
}: {
	searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
	const params = await searchParams;
	const param = (name: string) => {
		const value = params[name];
		return typeof value === "string" ? value : null;
	};
	const redirect = param("redirect");

	return (
		<SignInForm
			redirect={redirect}
			callbackErrorParam={param("error")}
			connect={connectSignInContext({
				redirect,
				reason: param("reason"),
				apiUrl: env.NEXT_PUBLIC_API_URL,
			})}
		/>
	);
}
