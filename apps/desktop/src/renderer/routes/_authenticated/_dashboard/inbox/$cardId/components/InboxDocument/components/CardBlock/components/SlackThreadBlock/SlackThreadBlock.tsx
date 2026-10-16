import { Trans } from "@lingui/react/macro";
import type { RouterOutputs } from "@superset/trpc";
import { useMemo } from "react";
import { useNow } from "renderer/hooks/useNow";
import { SlackWorkspaceProvider } from "../../providers/SlackWorkspaceProvider";
import type { CardInput } from "../../types";
import { ActionButton } from "../ActionButton";
import { ConnectSlackBar } from "../ConnectSlackBar";
import { HeaderActions } from "../HeaderActions";
import { SlackComposer } from "../SlackComposer";
import { SlackOpenLink } from "../SlackOpenLink";
import { SlackThreadMessages } from "../SlackThreadMessages";

type DocumentBlocks = NonNullable<RouterOutputs["inbox"]["document"]["blocks"]>;
type CardBlockData = Extract<DocumentBlocks[number], { type: "card" }>;
type Resolved = CardBlockData["resolved"];
export type SlackThreadView = Extract<
	NonNullable<Resolved["view"]>,
	{ kind: "slack.thread" }
>;

const NOW_TICK_MS = 60_000;

interface SlackThreadBlockProps {
	view: SlackThreadView;
	/** The right side of the card's header row, where "Leave it" and the way to Slack go. */
	headerSlot: HTMLElement | null;
	actions: Resolved["actions"];
	done: boolean;
	pending: boolean;
	/** Why the last reply or command failed; the composer keeps the text. */
	failure: string | null;
	onAct: (actionId: string, input?: CardInput) => void;
	onConnect: (href: string) => void;
}

/**
 * The thread laid out as Slack lays it out: the root message, a "N replies"
 * rule, the replies, then the reply box. Zone 2 of the trust model still:
 * every message came from Slack through the org's connection; the only text
 * of ours is the reader's own reply.
 */
export function SlackThreadBlock({
	view,
	headerSlot,
	actions,
	done,
	pending,
	failure,
	onAct,
	onConnect,
}: SlackThreadBlockProps) {
	const now = useNow(NOW_TICK_MS);
	const people = useMemo(
		() => [...view.messages.map((m) => m.user), ...view.members],
		[view.messages, view.members],
	);
	const reply = actions.find((a) => a.id === "reply");
	const share = actions.find((a) => a.id === "reply_and_share");
	const reactAction = actions.find((a) => a.id === "react");
	const leave = actions.find((a) => a.id === "leave");
	const onReact =
		reactAction && view.readerConnected
			? (ts: string, name: string, remove: boolean) =>
					onAct(reactAction.id, `${ts} ${name}${remove ? " remove" : ""}`)
			: undefined;

	return (
		<SlackWorkspaceProvider
			people={people}
			names={view.names}
			channels={view.channels}
			groups={view.groups}
			emoji={view.emoji}
			workspaceUrl={view.permalink ? new URL(view.permalink).origin : null}
		>
			<HeaderActions slot={headerSlot}>
				{!done && (
					<ActionButton
						action={leave}
						pending={pending}
						variant="ghost"
						className="h-7 px-2 text-xs text-muted-foreground"
						onClick={() => onAct("leave")}
					>
						<Trans>Leave it</Trans>
					</ActionButton>
				)}
				{view.permalink && <SlackOpenLink href={view.permalink} />}
			</HeaderActions>
			<div className="flex flex-col pt-2">
				<SlackThreadMessages
					messages={view.messages}
					now={now}
					onReact={onReact}
				/>
				{!done && reply && !view.readerConnected && (
					<ConnectSlackBar onConnect={() => onConnect("/plugins/slack")} />
				)}
				{!done && reply && view.readerConnected && (
					<SlackComposer
						channelName={view.channel.name}
						draft={view.draft}
						members={view.members}
						emoji={view.emoji}
						channels={view.channels}
						pending={pending}
						failure={failure}
						onCommand={onAct}
						onReply={(text, alsoSend) =>
							onAct(alsoSend && share ? share.id : reply.id, text)
						}
					/>
				)}
			</div>
		</SlackWorkspaceProvider>
	);
}
