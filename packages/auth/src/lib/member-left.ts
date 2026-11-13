export type LeftMember = { userId: string; organizationId: string };

export type MemberLeftDeps = {
	removeShares: (member: LeftMember) => Promise<void>;
	syncSeats: (member: LeftMember) => Promise<void>;
};

/**
 * better-auth's leave route deletes the member without running
 * `afterRemoveMember`. The leave has already happened, so a failed step is
 * logged, not thrown.
 */
export async function afterMemberLeft(
	member: LeftMember,
	deps: MemberLeftDeps,
) {
	for (const [step, run] of [
		["remove shares", deps.removeShares],
		["sync seats", deps.syncSeats],
	] as const) {
		try {
			await run(member);
		} catch (error) {
			console.error(
				`[organization/leave] Failed to ${step} for ${member.userId} in ${member.organizationId}:`,
				error,
			);
		}
	}
}
