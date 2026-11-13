export type DepartedMember = { userId: string; organizationId: string };

export type DepartureKind = { kind: "left" } | { kind: "removed"; by: string };

type Step = (member: DepartedMember) => Promise<void>;

export type MemberDepartureDeps = {
	removeShares: Step;
	cleanUp: Step;
	notifyMember?: Step;
	syncSeats: Step;
	reportFailure: (step: string, member: DepartedMember, error: unknown) => void;
};

/** Null for anything but a member row, such as an `APIError`. */
export function departedMemberFrom(returned: unknown): DepartedMember | null {
	if (!returned || typeof returned !== "object") return null;
	const { userId, organizationId } = returned as Record<string, unknown>;
	return typeof userId === "string" && typeof organizationId === "string"
		? { userId, organizationId }
		: null;
}

/**
 * Runs after the member row is gone, for both better-auth's leave route and
 * `afterRemoveMember`. The departure has already happened, so a failed step is
 * reported, not thrown.
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
			deps.reportFailure(name, member, error);
		}
	}
}
