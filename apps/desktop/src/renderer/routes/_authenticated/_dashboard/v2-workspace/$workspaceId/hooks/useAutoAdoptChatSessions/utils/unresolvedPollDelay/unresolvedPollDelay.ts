import { UNRESOLVED_POLL_MAX_MS } from "../../constants";

export function unresolvedPollDelay(polls: number): number | false {
	return polls
		? Math.min(2_000 * 2 ** (polls - 1), UNRESOLVED_POLL_MAX_MS)
		: false;
}
