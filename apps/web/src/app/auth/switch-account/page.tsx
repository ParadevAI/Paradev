import { auth } from "@superset/auth/server";
import { headers } from "next/headers";
import { connectorNameFromRedirect } from "@/app/utils/connectorNameFromRedirect";
import { env } from "@/env";
import { SwitchAccount } from "./components/SwitchAccount";

export default async function SwitchAccountPage({
	searchParams,
}: {
	searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
	const { redirect } = await searchParams;
	const target = typeof redirect === "string" ? redirect : null;
	const session = await auth.api.getSession({ headers: await headers() });

	return (
		<SwitchAccount
			email={session?.user.email ?? null}
			redirect={target}
			connectorName={connectorNameFromRedirect({
				redirect: target,
				apiUrl: env.NEXT_PUBLIC_API_URL,
			})}
		/>
	);
}
