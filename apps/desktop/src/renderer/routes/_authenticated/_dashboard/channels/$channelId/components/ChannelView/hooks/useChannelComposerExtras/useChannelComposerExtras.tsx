import { useLingui } from "@lingui/react/macro";
import type {
	ComposerChip,
	ComposerMentionEntry,
} from "@superset/chat-ui/PromptInput";
import { useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { DevAvatar } from "renderer/routes/_authenticated/_dashboard/components/DevAvatar";
import { useOrganizationPeople } from "renderer/routes/_authenticated/_dashboard/hooks/useOrganizationPeople";
import type { ComposerExtras } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/ChatSession/providers/ComposerExtrasProvider";
import { useHostWorkspaces } from "renderer/routes/_authenticated/providers/HostWorkspacesProvider";
import { useChannelAgents } from "../../../../hooks/useChannelAgents";
import { useSendChannelText } from "../../../../hooks/useSendChannelText";
import { useChannelDevs } from "../../../ChannelPane/hooks/useChannelDevs";
import { STATE_LABELS } from "../../../ChannelPane/utils/agentLabels";
import { StateDot } from "../../../StateDot";
import {
	agentChip,
	chipAgentId,
	chipDevId,
	devChip,
} from "../../utils/memberChips";

/**
 * The @ menu of a channel's agents and Devs in the coordinator's composer.
 * An agent chip reaches the coordinator as "@name" plus a hidden line that
 * names the workspace and its chat, so it can read or steer that agent. A
 * Dev chip posts the message to the channel for the Dev, which answers
 * there, and tells the coordinator not to act for it.
 */
export function useChannelComposerExtras(
	channelId: string,
	channelName: string,
): ComposerExtras {
	const { t } = useLingui();
	const { agents } = useChannelAgents(channelName);
	const devs = useChannelDevs(channelId);
	const { currentUserId } = useOrganizationPeople();
	const sendText = useSendChannelText(channelId, currentUserId);
	const queryClient = useQueryClient();
	const { cache } = useHostWorkspaces();
	return useMemo<ComposerExtras>(() => {
		// The pane's rows already asked the host for each agent's newest chat;
		// the cached answer names the session so the coordinator need not search.
		const cachedSessionId = (workspace: { id: string; hostId: string }) => {
			const hostUrl = cache.resolveHostUrl(workspace.hostId);
			const session = queryClient.getQueryData<{ sessionId: string } | null>([
				"channel-agent",
				"sessions",
				hostUrl,
				workspace.id,
			]);
			return session?.sessionId ?? null;
		};
		const agentEntries = agents.map(
			({ workspace, state }): ComposerMentionEntry => ({
				id: `agent:${workspace.id}`,
				label: workspace.name,
				description: `${t(STATE_LABELS[state])} · ${workspace.branch}`,
				icon: <StateDot state={state} />,
				keywords: [workspace.branch],
				select: (ctx) => ctx.insertChip(agentChip(workspace)),
			}),
		);
		const devEntries = devs.map(
			(dev): ComposerMentionEntry => ({
				id: `dev:${dev.actorId}`,
				label: dev.name,
				description: t({ message: "Dev · answers in the channel" }),
				icon: <DevAvatar avatar={dev.avatar} size={16} />,
				select: (ctx) => ctx.insertChip(devChip(dev)),
			}),
		);
		const entries = [...agentEntries, ...devEntries];
		const devsOf = (chips: readonly ComposerChip[]) =>
			devs.filter((dev) =>
				chips.some((chip) => chipDevId(chip) === dev.actorId),
			);
		return {
			mentionProviders:
				entries.length === 0
					? []
					: [
							{
								id: "channel-members",
								title: t({ message: `In #${channelName}` }),
								priority: -1,
								source: { kind: "static", load: () => entries },
							},
						],
			contextLine: (chips) => {
				const lines = new Map<string, string>();
				for (const chip of chips) {
					const id = chipAgentId(chip);
					const agent = id
						? agents.find((candidate) => candidate.workspace.id === id)
						: undefined;
					if (!agent) continue;
					const sessionId = cachedSessionId(agent.workspace);
					lines.set(
						agent.workspace.id,
						sessionId
							? `- @${agent.workspace.name}: workspace ${agent.workspace.id}, branch ${agent.workspace.branch}, chat session ${sessionId} (superset sessions read / send --local --workspace ${agent.workspace.id} --session ${sessionId}).`
							: `- @${agent.workspace.name}: workspace ${agent.workspace.id}, branch ${agent.workspace.branch}. Its chat: superset sessions list --local --workspace ${agent.workspace.id}, then read or send with the newest live session.`,
					);
				}
				for (const dev of devsOf(chips)) {
					lines.set(
						dev.actorId,
						`- @${dev.name} is a Dev, a teammate agent of this channel. This message was also posted to the channel for it, and the person sees its answer under their message. Do not act for it and do not say that it will answer. If nothing else in the message is for you, reply in a few words at most.`,
					);
				}
				if (lines.size === 0) return null;
				return [
					"Agents and Devs of this channel the message names. Act on a named agent; the person can see its chat in the channel's pane.",
					...lines.values(),
				].join("\n");
			},
			afterSend: (text, chips) => {
				const mentioned = devsOf(chips);
				if (mentioned.length === 0) return;
				sendText(text, { mentionedIds: mentioned.map((dev) => dev.actorId) });
			},
		};
	}, [agents, devs, channelName, t, cache, queryClient, sendText]);
}
