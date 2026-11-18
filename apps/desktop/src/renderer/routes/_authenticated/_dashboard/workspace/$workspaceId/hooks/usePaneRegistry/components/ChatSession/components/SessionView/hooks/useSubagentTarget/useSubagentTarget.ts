import { useLingui } from "@lingui/react/macro";
import type { SessionClient } from "@superset/chat/client";
import type { SessionSnapshot } from "@superset/chat/core";
import {
	subagentItem,
	subagentOutcome,
	userMessageText,
} from "@superset/chat/core";
import type { Item, UserContent, UserMessage } from "@superset/chat/protocol";
import type { ComposerDraft } from "@superset/chat-ui/PromptInput";
import { toast } from "@superset/ui/sonner";
import { useCallback, useMemo, useRef, useState } from "react";
import type { ComposerTarget, SubagentBlock } from "../../../Composer";

type Send = (
	content: UserContent[],
	options: { steer: boolean; draft: ComposerDraft },
) => unknown;

export type QueuedSteer = {
	id: string;
	subagentId: string;
	content: UserContent[];
	text: string;
	seen: ReadonlySet<string>;
	settled: boolean;
};

function steerEchoes(
	items: SessionSnapshot["items"],
	subagentId: string,
): UserMessage[] {
	return [...items.values()].flatMap(({ item }: { item: Item }) =>
		item.kind === "user_message" &&
		item.parentItemId === subagentId &&
		(item as UserMessage).from !== "parent"
			? [item as UserMessage]
			: [],
	);
}

export function useSubagentTarget({
	client,
	items,
	focusedId,
	draftKey,
	onSend,
	onStop,
	onUnsent,
}: {
	client: Pick<SessionClient, "steerSubagent">;
	items: SessionSnapshot["items"];
	focusedId: string | null;
	draftKey: string;
	onSend: Send;
	onStop: (taskId: string) => void;
	onUnsent: (content: UserContent[], draftKey: string) => void;
}): {
	onSend: Send;
	target: ComposerTarget | undefined;
	draftKey: string;
	queued: QueuedSteer[];
} {
	const { t } = useLingui();
	const [hostCannotSteer, setHostCannotSteer] = useState(false);
	const [steers, setSteers] = useState<QueuedSteer[]>([]);
	const steerCount = useRef(0);
	const itemsRef = useRef(items);
	itemsRef.current = items;
	const item = subagentItem(items, focusedId);
	const itemId = item?.id;
	const name = item ? item.title || t({ message: "Subagent" }) : "";
	const outcome = item ? subagentOutcome(item) : undefined;
	const unreachableReason = t({ message: `${name} can't be messaged` });
	const hostTooOldReason = t({
		message: "Update this host to message subagents",
	});
	const canStop = item?.canStop === true;

	const blockedBy: SubagentBlock | undefined = !item
		? undefined
		: hostCannotSteer
			? "host"
			: outcome === "stopped"
				? "stopped"
				: item.canSteer
					? undefined
					: outcome === "failed"
						? "failed"
						: outcome === "running"
							? "agent"
							: "ended";
	const disabledReason =
		blockedBy === "host"
			? hostTooOldReason
			: blockedBy === "stopped"
				? t({ message: `${name} stopped` })
				: blockedBy === "failed"
					? t({ message: `${name} failed` })
					: blockedBy === "agent" || blockedBy === "ended"
						? unreachableReason
						: undefined;

	const stop = useCallback(() => {
		if (itemId) onStop(itemId);
	}, [itemId, onStop]);

	const target = useMemo<ComposerTarget | undefined>(
		() =>
			itemId
				? {
						name,
						...(blockedBy && disabledReason
							? { disabledReason, blockedBy }
							: {}),
						...(canStop ? { onStop: stop } : {}),
					}
				: undefined,
		[itemId, name, disabledReason, blockedBy, canStop, stop],
	);

	const steer = useCallback(
		async (content: UserContent[]) => {
			if (!itemId) return;
			const origin = `${draftKey}:subagent:${itemId}`;
			steerCount.current += 1;
			const entry: QueuedSteer = {
				id: `steer:${steerCount.current}`,
				subagentId: itemId,
				content,
				text: userMessageText({ content }).trim(),
				seen: new Set(
					steerEchoes(itemsRef.current, itemId).map((echo) => echo.id),
				),
				settled: false,
			};
			setSteers((current) => [...current, entry]);
			const drop = () =>
				setSteers((current) => current.filter(({ id }) => id !== entry.id));
			const stillSteerable = () => {
				const current = subagentItem(itemsRef.current, itemId);
				return (
					current?.canSteer === true && subagentOutcome(current) !== "stopped"
				);
			};
			const giveBack = (toMainChat: boolean, message: string) => {
				drop();
				onUnsent(content, toMainChat ? draftKey : origin);
				toast.error(message);
			};
			const backInMainChat = t({
				message: `${name} can't take messages. Your text is back in the main chat.`,
			});
			const backInComposer = t({
				message: "Couldn't send your message. It's back in the composer.",
			});
			try {
				const result = await client.steerSubagent(itemId, content);
				if (result === "steered") {
					setSteers((current) =>
						current.map((steer) =>
							steer.id === entry.id ? { ...steer, settled: true } : steer,
						),
					);
					return;
				}
				if (result === "unsupported") {
					setHostCannotSteer(true);
					giveBack(
						true,
						t({
							message:
								"Update this host to message subagents. Your text is back in the main chat.",
						}),
					);
					return;
				}
				const steerable = stillSteerable();
				giveBack(!steerable, steerable ? backInComposer : backInMainChat);
			} catch (error) {
				console.warn("[useSubagentTarget] could not message subagent", error);
				const steerable = stillSteerable();
				giveBack(!steerable, steerable ? backInComposer : backInMainChat);
			}
		},
		[client, itemId, draftKey, onUnsent, name, t],
	);

	const queued = useMemo(() => {
		const unclaimed = new Map<string, string>();
		return steers.filter((entry) => {
			const echo = steerEchoes(items, entry.subagentId).find(
				(candidate) =>
					!entry.seen.has(candidate.id) &&
					(unclaimed.get(candidate.id) ?? userMessageText(candidate)).includes(
						entry.text,
					),
			);
			if (echo) {
				unclaimed.set(
					echo.id,
					(unclaimed.get(echo.id) ?? userMessageText(echo)).replace(
						entry.text,
						"",
					),
				);
				return false;
			}
			const subagent = subagentItem(items, entry.subagentId);
			const ended =
				!subagent ||
				subagentOutcome(subagent) === "stopped" ||
				subagentOutcome(subagent) === "failed";
			if (entry.settled && ended) return false;
			return entry.subagentId === itemId;
		});
	}, [steers, items, itemId]);

	return {
		queued,
		onSend: itemId ? steer : onSend,
		target,
		draftKey: itemId ? `${draftKey}:subagent:${itemId}` : draftKey,
	};
}
