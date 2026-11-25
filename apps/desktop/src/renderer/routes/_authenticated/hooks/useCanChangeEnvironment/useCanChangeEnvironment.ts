import { useIsOrganizationAdmin } from "renderer/hooks/useIsOrganizationAdmin";
import { authClient } from "renderer/lib/auth-client";

/**
 * Whether the signed-in person may change an environment for everyone, as
 * the API decides it: anyone on a personal one, else its creator or an admin.
 */
export function useCanChangeEnvironment(
	environment:
		| { scope: string; createdByUserId: string | null }
		| null
		| undefined,
): boolean {
	const { data: session } = authClient.useSession();
	const isAdmin = useIsOrganizationAdmin() === true;
	return (
		!!environment &&
		(environment.scope !== "organization" ||
			environment.createdByUserId === session?.user?.id ||
			isAdmin)
	);
}
