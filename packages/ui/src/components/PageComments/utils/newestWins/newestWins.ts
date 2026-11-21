/**
 * Hands out tickets in call order and accepts a result only when no newer
 * ticket was accepted, so a late older result never overrides a newer one
 * and a newer failure never blocks an older success.
 */
export function newestWins() {
	let issued = 0;
	let accepted = 0;
	return {
		issue: () => ++issued,
		accept: (ticket: number) => {
			if (ticket <= accepted) return false;
			accepted = ticket;
			return true;
		},
	};
}
