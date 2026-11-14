import { auth } from "@superset/auth/server";
import { continueLegacyIntegrationConnect } from "@superset/shared/legacy-integration-connect";

export function GET(request: Request) {
	return continueLegacyIntegrationConnect(request, async () => {
		const session = await auth.api.getSession({ headers: request.headers });
		return Boolean(session?.user);
	});
}
