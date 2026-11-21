import { CLIError } from "@superset/cli-framework";
import type { ApiClient } from "../../../lib/api-client";

export type Grantee =
	| { kind: "user"; userId: string }
	| { kind: "team"; teamId: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Users by id or email (an organization member), teams by id. */
export async function resolveGrantees(
	api: ApiClient,
	users: string[],
	teams: string[],
): Promise<Grantee[]> {
	if (users.length === 0 && teams.length === 0) {
		throw new CLIError(
			"Nobody to share with",
			"Pass --user <email|id> or --team <id>; list members with: superset organization members list",
		);
	}
	const grantees: Grantee[] = [];
	for (const user of users) {
		if (UUID.test(user)) {
			grantees.push({ kind: "user", userId: user });
			continue;
		}
		const matches = await api.organization.members.list.query({
			search: user,
			limit: 100,
		});
		const member = matches.find(
			(candidate) => candidate.email.toLowerCase() === user.toLowerCase(),
		);
		if (!member) {
			throw new CLIError(
				`No member with email ${user} in this organization`,
				"Run: superset organization members list",
			);
		}
		grantees.push({ kind: "user", userId: member.id });
	}
	for (const teamId of teams) grantees.push({ kind: "team", teamId });
	return grantees;
}
