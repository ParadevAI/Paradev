import { env } from "@/env";
import { SignInForm } from "./components/SignInForm";
import { connectorNameFromRedirect } from "./utils/connectorNameFromRedirect";

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
			connectorName={connectorNameFromRedirect({
				redirect,
				apiUrl: env.NEXT_PUBLIC_API_URL,
			})}
			sessionExpired={param("reason") === "session_expired"}
		/>
	);
}
