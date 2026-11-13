export type DepartedMember = { userId: string; organizationId: string };

type Step = (member: DepartedMember) => Promise<void>;

export type MemberDepartureDeps = {
	removeShares: Step;
	cleanUp: Step;
	/** Absent when the member left on their own. */
	notifyMember?: Step;
	syncSeats: Step;
};

/**
 * Runs after the member row is gone, for both better-auth's leave route and
 * `afterRemoveMember`. The departure has already happened, so a failed step is
 * logged, not thrown.
 */
export async function afterMemberDeparted(
	member: DepartedMember,
	deps: MemberDepartureDeps,
) {
	const steps: [string, Step | undefined][] = [
		["remove shares", deps.removeShares],
		["clean up", deps.cleanUp],
		["notify member", deps.notifyMember],
		["sync seats", deps.syncSeats],
	];
	for (const [name, run] of steps) {
		if (!run) continue;
		try {
			await run(member);
		} catch (error) {
			console.error(
				`[member-departure] Failed to ${name} for ${member.userId} in ${member.organizationId}:`,
				error,
			);
		}
	}
}
