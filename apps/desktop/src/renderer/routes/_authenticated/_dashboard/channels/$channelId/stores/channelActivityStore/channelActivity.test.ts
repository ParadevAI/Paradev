import { describe, expect, test } from "bun:test";
import type { ChannelAgent } from "../../hooks/useChannelAgents";
import { EMPTY_ACTIVITY, MAX_EVENTS, recordAgents } from "./channelActivity";

function agent(
	id: string,
	state: ChannelAgent["state"],
	extra: Partial<ChannelAgent["workspace"]> = {},
): ChannelAgent {
	return {
		state,
		workspace: {
			id,
			name: `ws-${id}`,
			createdAt: new Date(1000),
			lastAgentEventAt: 5000,
			pr: null,
			...extra,
		} as ChannelAgent["workspace"],
	};
}

describe("recordAgents", () => {
	test("an agent seen for the first time joined, with its state and pull request", () => {
		const pr = {
			prNumber: 7,
			state: "merged",
			mergedAt: 9000,
		} as ChannelAgent["workspace"]["pr"];
		const next = recordAgents(
			EMPTY_ACTIVITY,
			[agent("a", "done", { pr })],
			10_000,
		);
		expect(next.events.map((event) => [event.kind, event.at])).toEqual([
			["joined", 1000],
			["done", 5000],
			["pr", 5000],
			["merged", 9000],
		]);
	});

	test("only a change becomes an event, and the same agents again change nothing", () => {
		const first = recordAgents(EMPTY_ACTIVITY, [agent("a", "working")], 10_000);
		expect(recordAgents(first, [agent("a", "working")], 11_000)).toBe(first);
		const second = recordAgents(
			first,
			[agent("a", "review", { lastAgentEventAt: 12_000 })],
			12_500,
		);
		expect(second.events.map((event) => event.kind)).toEqual([
			"joined",
			"working",
			"review",
		]);
		expect(second.events.at(-1)?.at).toBe(12_000);
	});

	test("finished work is a finish, not a wait, and going idle is nothing", () => {
		const first = recordAgents(
			EMPTY_ACTIVITY,
			[agent("a", "waiting", { agentStatus: "review" })],
			10_000,
		);
		expect(first.events.map((event) => event.kind)).toEqual([
			"joined",
			"review",
		]);
		const second = recordAgents(first, [agent("a", "idle")], 11_000);
		expect(second.events.map((event) => event.kind)).toEqual([
			"joined",
			"review",
		]);
	});

	test("keeps the newest events only", () => {
		let activity = EMPTY_ACTIVITY;
		for (let step = 0; step < MAX_EVENTS + 10; step += 1) {
			activity = recordAgents(
				activity,
				[
					agent("a", step % 2 ? "working" : "review", {
						lastAgentEventAt: 1000 + step,
					}),
				],
				2000 + step,
			);
		}
		expect(activity.events).toHaveLength(MAX_EVENTS);
		expect(activity.events[0]?.kind).not.toBe("joined");
	});
});
