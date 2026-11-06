import type { SessionUsage, Turn } from "../../protocol/envelope";

export function latestSessionUsage(
	turns: ReadonlyMap<string, Turn>,
): SessionUsage | null {
	let latest: SessionUsage | null = null;
	for (const turn of turns.values()) latest = turn.sessionUsage ?? latest;
	return latest;
}
