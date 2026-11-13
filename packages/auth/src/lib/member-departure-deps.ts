import { db } from "@superset/db/client";
import { organizations, users } from "@superset/db/schema";
import { cleanupRemovedMember } from "@superset/db/utils";
import { MemberRemovedEmail } from "@superset/email/emails/team/member-removed";
import { NOREPLY_FROM } from "@superset/email/sender";
import { eq } from "drizzle-orm";
import { alertBilling } from "./billing/autumn/alert";
import { syncSeatsAfterRemoval } from "./billing/seat-removal";
import { seatRemovalDeps } from "./billing/seat-removal-deps";
import type { DepartedMember, MemberDepartureDeps } from "./member-departure";
import { removeMemberShares } from "./pending-shares";
import { resend } from "./resend";

type Departure = {
	organization: { id: string; name: string };
	user: { name: string | null; email: string };
};

async function loadDeparture({
	userId,
	organizationId,
}: DepartedMember): Promise<Departure | null> {
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
	return organization && user ? { organization, user } : null;
}

/** `removedByName` is null when the member left on their own. */
export function memberDepartureDeps({
	removedByName,
	departure: known,
}: {
	removedByName: string | null;
	departure?: Departure;
}): MemberDepartureDeps {
	let loaded: Promise<Departure | null> | undefined;
	const departureOf = (member: DepartedMember) => {
		loaded ??= known ? Promise.resolve(known) : loadDeparture(member);
		return loaded;
	};
	return {
		removeShares: removeMemberShares,
		cleanUp: async (member) => {
			await cleanupRemovedMember(member);
		},
		notifyMember:
			removedByName === null
				? undefined
				: async (member) => {
						const departure = await departureOf(member);
						if (!departure) return;
						await resend.emails.send({
							from: NOREPLY_FROM,
							to: departure.user.email,
							subject: `You've been removed from ${departure.organization.name}`,
							react: MemberRemovedEmail({
								memberName: departure.user.name,
								organizationName: departure.organization.name,
								removedByName,
							}),
						});
					},
		syncSeats: async (member) => {
			try {
				const departure = await departureOf(member);
				if (!departure) return;
				await syncSeatsAfterRemoval(
					{
						organization: departure.organization,
						member: departure.user,
						removedByName,
					},
					seatRemovalDeps(),
				);
			} catch (error) {
				await alertBilling(
					`Seat sync for ${member.organizationId} failed after ${member.userId} left or was removed; check its seat count and billing emails`,
					error,
				);
			}
		},
	};
}
