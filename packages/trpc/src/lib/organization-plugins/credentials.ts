import { getRoleLevel, type OrganizationRole } from "@superset/shared/auth";
import { githubUserTokenFor } from "../github-user";
import { memberRole } from "./access";

export interface CredentialDeps {
	memberRole(userId: string, organizationId: string): Promise<string | null>;
	userToken(userId: string): Promise<string | null>;
}

const defaultDeps: CredentialDeps = {
	memberRole,
	userToken: githubUserTokenFor,
};

const READD = "have another admin add the repository again";

/**
 * A source is read only with the GitHub account of the admin who added it, as
 * Codex does: the identity never changes behind anyone's back, and another
 * admin takes a source over by adding it again.
 */
export async function sourceToken(
	source: { organizationId: string; addedByUserId: string | null },
	deps: CredentialDeps = defaultDeps,
): Promise<string> {
	if (!source.addedByUserId) {
		throw new Error(`the admin who added it has left; ${READD}`);
	}
	const role = await deps.memberRole(
		source.addedByUserId,
		source.organizationId,
	);
	if (!role || getRoleLevel(role as OrganizationRole) < getRoleLevel("admin")) {
		throw new Error(`the admin who added it is no longer an admin; ${READD}`);
	}
	const token = await deps.userToken(source.addedByUserId);
	if (!token) {
		throw new Error(
			`the admin who added it has no GitHub account connected; they can reconnect GitHub, or ${READD}`,
		);
	}
	return token;
}
