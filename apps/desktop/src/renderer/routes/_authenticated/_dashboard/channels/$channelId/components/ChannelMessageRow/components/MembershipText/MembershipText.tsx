import { Trans } from "@lingui/react/macro";
import { Fragment, type ReactNode } from "react";
import type { ChannelMessage } from "renderer/routes/_authenticated/utils/channelMessageCache";
import type { ChannelPerson } from "../../ChannelMessageRow";
import { ActorName } from "./components/ActorName";
import { OthersLabel } from "./components/OthersLabel";
import {
	type MembershipSentence,
	membershipSentences,
} from "./utils/membershipSentences";

interface MembershipTextProps {
	/** The row's join or leave and the ones rolled up after it. */
	messages: ChannelMessage[];
	channelId: string;
	/** `#name`, or the bare name for a private channel, as Slack writes it. */
	channelLabel: string;
	/** The row's author is a Dev, which Slack words as an app. */
	isDev: boolean;
	peopleById: Map<string, ChannelPerson>;
	devNames: Map<string, string>;
	currentUserId: string | null;
}

/** Slack's wording for joins and leaves, rolled up as Slack does. */
export function MembershipText({
	messages,
	channelLabel,
	isDev,
	...names
}: MembershipTextProps) {
	const nameOf = (actorId: string) => (
		<ActorName actorId={actorId} {...names} />
	);
	const othersOf = (actorIds: string[]) => (
		<OthersLabel actorIds={actorIds} {...names} />
	);
	return (
		<p className="text-[15px] leading-[1.4667] text-muted-foreground">
			{membershipSentences(messages).map((sentence, index) => (
				<Fragment key={sentence.subjectId}>
					{index > 0 && " "}
					{sentence.first
						? leadSentence(sentence, channelLabel, isDev, nameOf, othersOf)
						: laterSentence(sentence, nameOf, othersOf)}
				</Fragment>
			))}
		</p>
	);
}

function leadSentence(
	{ action, inviterId, otherIds }: MembershipSentence,
	channel: string,
	isDev: boolean,
	nameOf: (actorId: string) => ReactNode,
	othersOf: (actorIds: string[]) => ReactNode,
): ReactNode {
	const inviter = inviterId ? nameOf(inviterId) : null;
	const others = otherIds.length > 0 ? othersOf(otherIds) : null;
	if (isDev && inviter) {
		return action === "leave" ? (
			<Trans>was removed from this conversation by {inviter}.</Trans>
		) : (
			<Trans>was added to this conversation by {inviter}.</Trans>
		);
	}
	switch (action) {
		case "join":
			if (inviter) {
				return others ? (
					<Trans>
						was added to {channel} by {inviter}, along with {others}.
					</Trans>
				) : (
					<Trans>
						was added to {channel} by {inviter}.
					</Trans>
				);
			}
			return others ? (
				<Trans>
					joined {channel} along with {others}.
				</Trans>
			) : (
				<Trans>joined {channel}.</Trans>
			);
		case "leave":
			return others ? (
				<Trans>
					left {channel} along with {others}.
				</Trans>
			) : (
				<Trans>left {channel}.</Trans>
			);
		case "join,leave":
			return others ? (
				<Trans>
					joined and left {channel} along with {others}.
				</Trans>
			) : (
				<Trans>joined and left {channel}.</Trans>
			);
		case "leave,join":
			if (inviter) {
				return others ? (
					<Trans>
						rejoined {channel} by invitation from {inviter}, along with {others}
						.
					</Trans>
				) : (
					<Trans>
						rejoined {channel} by invitation from {inviter}.
					</Trans>
				);
			}
			return others ? (
				<Trans>
					rejoined {channel}, along with {others}.
				</Trans>
			) : (
				<Trans>rejoined {channel}.</Trans>
			);
	}
}

function laterSentence(
	{ subjectId, action, otherIds, also }: MembershipSentence,
	nameOf: (actorId: string) => ReactNode,
	othersOf: (actorIds: string[]) => ReactNode,
): ReactNode {
	const user = nameOf(subjectId);
	const others = otherIds.length > 0 ? othersOf(otherIds) : null;
	switch (action) {
		case "join":
			if (also) {
				return others ? (
					<Trans>
						Also, {user} and {others} joined.
					</Trans>
				) : (
					<Trans>Also, {user} joined.</Trans>
				);
			}
			return others ? (
				<Trans>
					{user} and {others} joined.
				</Trans>
			) : (
				<Trans>{user} joined.</Trans>
			);
		case "leave":
			if (also) {
				return others ? (
					<Trans>
						Also, {user} and {others} left.
					</Trans>
				) : (
					<Trans>Also, {user} left.</Trans>
				);
			}
			return others ? (
				<Trans>
					{user} and {others} left.
				</Trans>
			) : (
				<Trans>{user} left.</Trans>
			);
		case "join,leave":
			if (also) {
				return others ? (
					<Trans>
						Also, {user} and {others} joined and left.
					</Trans>
				) : (
					<Trans>Also, {user} joined and left.</Trans>
				);
			}
			return others ? (
				<Trans>
					{user} and {others} joined and left.
				</Trans>
			) : (
				<Trans>{user} joined and left.</Trans>
			);
		case "leave,join":
			if (also) {
				return others ? (
					<Trans>
						Also, {user} and {others} rejoined.
					</Trans>
				) : (
					<Trans>Also, {user} rejoined.</Trans>
				);
			}
			return others ? (
				<Trans>
					{user} and {others} rejoined.
				</Trans>
			) : (
				<Trans>{user} rejoined.</Trans>
			);
	}
}
