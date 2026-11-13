import * as Sentry from "@sentry/core";
import { db } from "@superset/db/client";
import { organizations, users } from "@superset/db/schema";
import { cleanupRemovedMember } from "@superset/db/utils";
import { MemberRemovedEmail } from "@superset/email/emails/team/member-removed";
import { NOREPLY_FROM } from "@superset/email/sender";
import { eq } from "drizzle-orm";
import { alertBilling } from "./billing/autumn/alert";
import { syncSeatsAfterRemoval } from "./billing/seat-removal";
import { seatRemovalDeps } from "./billing/seat-removal-deps";
import type {
	DepartedMember,
	DepartureKind,
	MemberDepartureDeps,
} from "./member-departure";
import { removeMemberShares } from "./pending-shares";
import { resend } from "./resend";
import { throwOnResendError } from "./resend-result";

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

export function memberDepartureDeps({
	how,
	departure: known,
}: {
	how: DepartureKind;
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
			how.kind === "left"
				? undefined
				: async (member) => {
						const departure = await departureOf(member);
						if (!departure) return;
						throwOnResendError(
							await resend.emails.send({
								from: NOREPLY_FROM,
								to: departure.user.email,
								subject: `You've been removed from ${departure.organization.name}`,
								react: MemberRemovedEmail({
									memberName: departure.user.name,
									organizationName: departure.organization.name,
									removedByName: how.by,
								}),
							}),
						);
					},
		syncSeats: async (member) => {
			try {
				const departure = await departureOf(member);
				if (!departure) return;
				await syncSeatsAfterRemoval(
					{
						organization: departure.organization,
						member: departure.user,
						how,
					},
					seatRemovalDeps(),
				);
			} catch (error) {
				await alertBilling(
					`Seat sync for ${member.organizationId} failed after ${member.userId} ${how.kind === "left" ? "left" : "was removed"}; check its seat count and billing emails`,
					error,
				);
			}
		},
		reportFailure: (step, member, error) => {
			console.error(
				`[member-departure] Failed to ${step} for ${member.userId} in ${member.organizationId}:`,
				error,
			);
			Sentry.captureException(error, {
				tags: { memberDepartureStep: step },
				extra: { ...member, how: how.kind },
			});
		},
	};
}
