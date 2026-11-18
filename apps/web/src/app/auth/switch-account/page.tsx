import { auth } from "@superset/auth/server";
import { findOrgMembership } from "@superset/db/utils";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { apiUrlFromRedirect } from "@/app/utils/apiUrlFromRedirect";
import { connectorNameFromRedirect } from "@/app/utils/connectorNameFromRedirect";
import { env } from "@/env";
import { SwitchAccount } from "./components/SwitchAccount";

export default async function SwitchAccountPage({
	searchParams,
}: {
	searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
	const params = await searchParams;
	const target = typeof params.redirect === "string" ? params.redirect : null;
	const apiTarget = apiUrlFromRedirect({
		redirect: target,
		apiUrl: env.NEXT_PUBLIC_API_URL,
	});
	const session = await auth.api.getSession({ headers: await headers() });

	const organizationId = apiTarget?.searchParams.get("organizationId");
	if (apiTarget && organizationId && session?.user) {
		const membership = await findOrgMembership({
			userId: session.user.id,
			organizationId,
		}).catch(() => undefined);
		if (membership) redirect(apiTarget.href);
	}

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
