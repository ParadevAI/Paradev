import { db } from "@superset/db/client";
import {
	type GraphChannel,
	type GraphChatMessage,
	getChannel,
	getChannelMessage,
	getGraphAccessToken,
	plainTextOf,
} from "@superset/trpc/integrations/microsoft-teams";

import { dispatchMatchingTriggers } from "@/lib/automations/dispatchMatchingTriggers";
import { recordAutomationEvent } from "@/lib/automations/recordAutomationEvent";
import {
	type AuthenticatedConnection,
	type ChangeNotification,
	parseTeamsResource,
} from "./notifications";

const TITLE_LENGTH = 120;

export type NotificationOutcome =
	| {
			outcome: "recorded";
			eventId: string;
			matched: number;
			considered: number;
	  }
	| { outcome: "skipped"; reason: string };

/**
 * Turns one authenticated change notification into an automation event.
 *
 * The notification says only what changed; the resource is fetched, recorded
 * with the fetched payload, then matched. Ordering matters: the row is
 * written before dispatch so a run always has an event to point at, and the
 * dedupe on that row is what makes a Graph redelivery a no-op.
 */
export async function handleNotification(
	connection: AuthenticatedConnection,
	notification: ChangeNotification,
): Promise<NotificationOutcome> {
	if (notification.changeType !== "created") {
		return {
			outcome: "skipped",
			reason: `changeType ${notification.changeType}`,
		};
	}
	const resource = parseTeamsResource(notification.resource);
	if (!resource) {
		return { outcome: "skipped", reason: "unrecognised resource" };
	}
	const type = (notification.resourceData?.["@odata.type"] ?? "").toLowerCase();

	const accessToken = await getGraphAccessToken(connection.id);
	if (!accessToken) return { outcome: "skipped", reason: "no access token" };

	if (type.endsWith(".chatmessage") && resource.messageId) {
		const message = await getChannelMessage(
			accessToken,
			resource.teamId,
			resource.channelId,
			resource.messageId,
			resource.replyId,
		);
		return ingestChannelMessage(
			connection,
			{ ...resource, messageId: resource.messageId },
			message,
		);
	}

	if (type.endsWith(".channel") && !resource.messageId) {
		const channel = await getChannel(
			accessToken,
			resource.teamId,
			resource.channelId,
		);
		return ingestChannel(connection, resource, channel);
	}

	return { outcome: "skipped", reason: `unhandled resource type ${type}` };
}

/** Records a fetched channel message and dispatches what it matches. */
export async function ingestChannelMessage(
	connection: AuthenticatedConnection,
	resource: {
		teamId: string;
		channelId: string;
		messageId: string;
		replyId?: string;
	},
	message: GraphChatMessage,
): Promise<NotificationOutcome> {
	// Membership changes and the like arrive as messages too; nobody means
	// those when they say "a message in the channel".
	if (message.messageType && message.messageType !== "message") {
		return {
			outcome: "skipped",
			reason: `messageType ${message.messageType}`,
		};
	}
	const messageId = resource.replyId ?? resource.messageId;
	const text = plainTextOf(message.body);
	const actorLogin =
		message.from?.user?.displayName ??
		message.from?.application?.displayName ??
		null;

	const recorded = await recordAutomationEvent(db, {
		organizationId: connection.organizationId,
		integrationConnectionId: connection.id,
		provider: "microsoft_teams",
		eventType: "message_in_channel",
		externalEventId: `${resource.channelId}:${messageId}`,
		// The thread, so replies debounce with the message they answer.
		resourceKey: `microsoft_teams:${resource.teamId}:${resource.channelId}:${message.replyToId ?? resource.messageId}`,
		title: titleFor(message.subject, text),
		url: message.webUrl ?? null,
		actorLogin,
		payload: {
			teamId: resource.teamId,
			channelId: resource.channelId,
			message,
		},
	});
	if (!recorded) {
		return { outcome: "skipped", reason: "duplicate delivery" };
	}
	const result = await dispatchMatchingTriggers({
		organizationId: connection.organizationId,
		eventId: recorded.id,
		event: {
			provider: "microsoft_teams",
			eventType: "message_in_channel",
			teamId: resource.teamId,
			channelId: resource.channelId,
			actorId: message.from?.user?.id ?? null,
			actorLogin,
			body: text,
		},
	});
	return { outcome: "recorded", eventId: recorded.id, ...result };
}

/** Records a fetched channel and dispatches what it matches. */
export async function ingestChannel(
	connection: AuthenticatedConnection,
	resource: { teamId: string; channelId: string },
	channel: GraphChannel,
): Promise<NotificationOutcome> {
	const name = channel.displayName ?? resource.channelId;
	const recorded = await recordAutomationEvent(db, {
		organizationId: connection.organizationId,
		integrationConnectionId: connection.id,
		provider: "microsoft_teams",
		eventType: "channel_created",
		externalEventId: resource.channelId,
		resourceKey: `microsoft_teams:${resource.teamId}:${resource.channelId}`,
		title: name,
		url: channel.webUrl ?? null,
		actorLogin: null,
		payload: { teamId: resource.teamId, channel },
	});
	if (!recorded) {
		return { outcome: "skipped", reason: "duplicate delivery" };
	}
	const result = await dispatchMatchingTriggers({
		organizationId: connection.organizationId,
		eventId: recorded.id,
		event: {
			provider: "microsoft_teams",
			eventType: "channel_created",
			teamId: resource.teamId,
			channelId: resource.channelId,
			actorId: null,
			actorLogin: null,
			body: name,
		},
	});
	return { outcome: "recorded", eventId: recorded.id, ...result };
}

function titleFor(subject: string | null | undefined, text: string | null) {
	if (subject) return subject;
	const line = text
		?.split("\n")
		.find((l) => l.trim())
		?.trim();
	if (!line) return "Teams message";
	return line.length > TITLE_LENGTH ? `${line.slice(0, TITLE_LENGTH)}…` : line;
}
