import { useLingui } from "@lingui/react/macro";
import type {
	ComposerChip,
	ComposerMentionEntry,
	ComposerMentionProvider,
} from "@superset/chat-ui/PromptInput";
import type { ChannelBroadcast } from "@superset/shared/channels";
import { useCallback, useMemo } from "react";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { usePluginMentionProvider } from "renderer/routes/_authenticated/components/AgentComposer/hooks/usePluginMentionProvider";
import { BroadcastChip } from "../../components/BroadcastChip";
import type { ChannelPerson } from "../../components/ChannelMessageRow";
import { ChannelRefChip } from "../../components/ChannelRefChip";
import { DevMentionChip } from "../../components/DevMentionChip";
import { MentionBroadcastRow } from "../../components/MentionBroadcastRow";
import { MentionChannelRow } from "../../components/MentionChannelRow";
import { MentionChip } from "../../components/MentionChip";
import { MentionDevRow } from "../../components/MentionDevRow";
import { MentionPersonRow } from "../../components/MentionPersonRow";
import { MentionTaskRow } from "../../components/MentionTaskRow";
import {
	matchingBroadcasts,
	rankMentionCandidates,
} from "../../utils/mentionGroups";
import { useOrgChannels } from "../useOrgChannels";

/**
 * A channel composer's mentions: the @ menu (people with members first, then
 * @channel and @here; the channel's Devs; its tasks; plugins), the # menu of channels,
 * and chips drawn as in sent messages.
 */
export function useChannelMentions({
	channelId,
	people,
	currentUserId,
}: {
	channelId: string;
	people: ChannelPerson[];
	currentUserId: string | null;
}) {
	const { t } = useLingui();
	const { data: members } = cloudTrpc.channel.members.useQuery({ channelId });
	const devs = useMemo(
		() => (members ?? []).filter((member) => member.kind === "dev"),
		[members],
	);
	const { data: tasks } = cloudTrpc.channelTask.list.useQuery({ channelId });
	const channels = useOrgChannels();
	const pluginProvider = usePluginMentionProvider();

	const mentionProviders = useMemo((): ComposerMentionProvider[] => {
		const memberIds = new Set((members ?? []).map((member) => member.actorId));
		const searchPeople = async (query: string) => {
			const ranked = rankMentionCandidates(people, memberIds, query);
			const personEntries = [
				...ranked.members.map((person) => ({ person, isMember: true })),
				...ranked.others.map((person) => ({ person, isMember: false })),
			].map(
				({ person, isMember }): ComposerMentionEntry => ({
					id: `person:${person.id}`,
					label: person.name,
					row: (
						<MentionPersonRow
							userId={person.id}
							name={person.name}
							image={person.image}
							isSelf={person.id === currentUserId}
							isMember={isMember}
						/>
					),
					select: (ctx) =>
						ctx.insertChip({
							label: person.name,
							serialized: `@${person.name}`,
							data: { actorId: person.id },
						}),
				}),
			);
			const broadcastEntries = matchingBroadcasts(query).map(
				(broadcast): ComposerMentionEntry => ({
					id: `broadcast:${broadcast}`,
					label: broadcast,
					row: <MentionBroadcastRow broadcast={broadcast} />,
					select: (ctx) =>
						ctx.insertChip({
							label: `@${broadcast}`,
							serialized: `@${broadcast}`,
							data: { broadcast },
						}),
				}),
			);
			return [...personEntries, ...broadcastEntries];
		};
		const devEntries = devs.map(
			(dev): ComposerMentionEntry => ({
				id: `dev:${dev.actorId}`,
				label: dev.name,
				row: <MentionDevRow name={dev.name} avatar={dev.avatar} />,
				select: (ctx) =>
					ctx.insertChip({
						label: dev.name,
						serialized: `@${dev.name}`,
						data: { actorId: dev.actorId },
					}),
			}),
		);
		const taskEntries = (tasks ?? []).map(
			(task): ComposerMentionEntry => ({
				id: `task:${task.id}`,
				label: task.title,
				keywords: [task.slug],
				row: <MentionTaskRow task={task} />,
				select: (ctx) =>
					ctx.insertChip({
						label: task.slug,
						serialized: task.slug,
					}),
			}),
		);
		const channelEntries = (channels ?? []).map(
			(channel): ComposerMentionEntry => ({
				id: `channel:${channel.id}`,
				label: channel.name,
				row: (
					<MentionChannelRow
						name={channel.name}
						visibility={channel.visibility}
					/>
				),
				select: (ctx) =>
					ctx.insertChip({
						label: `#${channel.name}`,
						serialized: `#${channel.name}`,
						data: { channelId: channel.id },
					}),
			}),
		);
		return [
			{
				id: "people",
				title: t({ message: "People" }),
				priority: 0,
				source: {
					kind: "search",
					search: searchPeople,
					emptyState: t({ message: "No one to mention" }),
				},
			},
			{
				id: "devs",
				title: t({ message: "Devs" }),
				priority: 1,
				source: { kind: "static", load: () => devEntries },
			},
			{
				id: "tasks",
				title: t({ message: "Tasks" }),
				priority: 1,
				source: { kind: "static", load: () => taskEntries },
			},
			{ ...pluginProvider, priority: 2 },
			{
				id: "channels",
				title: t({ message: "Channels" }),
				priority: 0,
				trigger: "#",
				source: { kind: "static", load: () => channelEntries },
			},
		];
	}, [
		members,
		devs,
		tasks,
		channels,
		people,
		currentUserId,
		pluginProvider,
		t,
	]);

	const renderChip = useCallback(
		(chip: ComposerChip) => {
			const broadcast = (
				chip.data as { broadcast?: ChannelBroadcast } | undefined
			)?.broadcast;
			if (broadcast) return <BroadcastChip>@{broadcast}</BroadcastChip>;
			const [actorId] = mentionedIds([chip]);
			if (devs.some((dev) => dev.actorId === actorId) && actorId) {
				return <DevMentionChip agentId={actorId}>@{chip.label}</DevMentionChip>;
			}
			if (isChannelChip(chip)) {
				return <ChannelRefChip>{chip.label}</ChannelRefChip>;
			}
			const person = people.find((candidate) => candidate.id === actorId);
			if (!person) return null;
			return (
				<MentionChip
					channelId={channelId}
					person={person}
					isSelf={person.id === currentUserId}
				>
					@{person.name}
				</MentionChip>
			);
		},
		[channelId, people, devs, currentUserId],
	);

	return { mentionProviders, renderChip };
}

/** The user ids of the people a composer's chips mention. */
/** The people and Devs a composer's chips mention. */
export function mentionedIds(
	mentions: readonly { data?: unknown }[],
): string[] {
	return mentions.flatMap((chip) => {
		const data = chip.data as { actorId?: unknown } | undefined;
		return typeof data?.actorId === "string" ? [data.actorId] : [];
	});
}

function isChannelChip(chip: ComposerChip): boolean {
	const data = chip.data as { channelId?: unknown } | undefined;
	return typeof data?.channelId === "string";
}
