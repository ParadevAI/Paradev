import { db } from "@superset/db/client";
import { organizations, users } from "@superset/db/schema";
import { eq } from "drizzle-orm";
import { alertBilling } from "./billing/autumn/alert";
import { syncSeatsAfterRemoval } from "./billing/seat-removal";
import { seatRemovalDeps } from "./billing/seat-removal-deps";
import type { MemberLeftDeps } from "./member-left";
import { removeMemberShares } from "./pending-shares";

export function memberLeftDeps(): MemberLeftDeps {
	return {
		removeShares: removeMemberShares,
		syncSeats: async ({ userId, organizationId }) => {
			try {
				const [organization, user] = await Promise.all([
					db.query.organizations.findFirst({
						where: eq(organizations.id, organizationId),
						columns: { id: true, name: true },
					}),
					db.query.users.findFirst({
						where: eq(users.id, userId),
						columns: { name: true, email: true },
					}),
				]);
				if (!organization || !user) return;
				await syncSeatsAfterRemoval(
					{ organization, member: user, removedByName: null },
					seatRemovalDeps(),
				);
			} catch (error) {
				await alertBilling(
					`Seat sync for ${organizationId} failed after ${userId} left; check its seat count and billing emails`,
					error,
				);
			}
		},
	};
}
