import type { RouterOutputs } from "@superset/trpc";
import { useMemo } from "react";
import { cloudTrpc } from "renderer/lib/cloud-trpc";

export type ChannelDev = Extract<
	RouterOutputs["channel"]["members"][number],
	{ kind: "dev" }
>;
/** A Dev's turn with the Dev it belongs to; turns name their Dev only through the query that fetched them. */
export type DevTurn = RouterOutputs["agent"]["activity"]["turns"][number] & {
	devId: string;
	devName: string;
};
export type ChannelRoutine = {
	dev: ChannelDev;
	routine: RouterOutputs["agentRoutine"]["list"][number];
};

const EMPTY_DEVS: ChannelDev[] = [];

/** The Devs that are members of the channel; the first one coordinates it. */
export function useChannelDevs(channelId: string): ChannelDev[] {
	const { data: members } = cloudTrpc.channel.members.useQuery({ channelId });
	return useMemo(
		() =>
			members
				? members.filter(
						(member): member is ChannelDev => member.kind === "dev",
					)
				: EMPTY_DEVS,
		[members],
	);
}

/** What the channel's Devs did in it, newest first: the first page of each Dev's turns. */
export function useChannelDevTurns(
	channelId: string,
	devs: readonly ChannelDev[],
): { turns: DevTurn[]; isPending: boolean } {
	const queries = cloudTrpc.useQueries((query) =>
		devs.map((dev) => query.agent.activity({ agentId: dev.actorId })),
	);
	const isPending = queries.some((query) => query.isPending);
	const pages = queries.map((query) => query.data);
	// biome-ignore lint/correctness/useExhaustiveDependencies: useQueries returns a fresh array; the pages are what matter
	const turns = useMemo(
		() =>
			devs
				.flatMap((dev, index) =>
					(pages[index]?.turns ?? []).map((turn) => ({
						...turn,
						devId: dev.actorId,
						devName: dev.name,
					})),
				)
				.filter((turn) => turn.channelId === channelId)
				.sort(
					(a, b) =>
						new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
				),
		[channelId, devs, ...pages],
	);
	return { turns, isPending };
}

/** The routines that answer in this channel, across its Devs. */
export function useChannelRoutines(
	channelId: string,
	devs: readonly ChannelDev[],
): ChannelRoutine[] {
	const queries = cloudTrpc.useQueries((query) =>
		devs.map((dev) => query.agentRoutine.list({ agentId: dev.actorId })),
	);
	const lists = queries.map((query) => query.data);
	// biome-ignore lint/correctness/useExhaustiveDependencies: useQueries returns a fresh array; the lists are what matter
	return useMemo(
		() =>
			devs.flatMap((dev, index) =>
				(lists[index] ?? [])
					.filter((routine) => routine.room.channelId === channelId)
					.map((routine) => ({ dev, routine })),
			),
		[channelId, devs, ...lists],
	);
}
