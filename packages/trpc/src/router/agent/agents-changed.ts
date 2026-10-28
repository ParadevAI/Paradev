import { allOrgMemberIds } from "../channel/members";
import { publishToUsers } from "../channel/publish";

/** Tells everyone in the organization to refetch its Devs: one started or finished work, or changed. */
export async function announceAgentsChanged(organizationId: string) {
	publishToUsers(await allOrgMemberIds(organizationId), {
		type: "agents.changed",
		organizationId,
	});
}
