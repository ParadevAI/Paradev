import { db } from "@superset/db/client";
import { chatsAgents, chatsTurns } from "@superset/db/schema";
import { and, desc, eq, gt } from "drizzle-orm";
import { z } from "zod";
import { type BoxKeys, verifyBoxCredential } from "./box-tokens";

/** Added to every request a box makes to the API by the box's network proxy. */
export const BOX_CREDENTIAL_HEADER = "x-dev-box";
/** The chat a box's request is for, set by the runner. Not a secret: the credential says who is asking. */
export const CHAT_HEADER = "x-dev-chat";

export class BoxRequestError extends Error {
	constructor(
		readonly status: number,
		readonly code: string,
		message: string,
	) {
		super(message);
	}
}

/** Which Dev is acting, and in which chat and turn, for a box's request. */
export interface BoxClaims {
	agentId: string;
	groupId: string;
	userId: string | null;
	turnId: string;
	/**
	 * No turn runs in the chat: the request is from work the Dev left running
	 * there, acting as its latest turn. Only reads, the model and notices take it.
	 */
	background?: boolean;
}

/** Work a Dev left running outlives its turn by at most this. */
export const BACKGROUND_MS = 2 * 60 * 60_000;

const chatId = z.string().uuid();

/**
 * The Dev whose box sent the request and the chat it names. The credential
 * must be for the Dev's current box, so a stopped box's stops working.
 */
export async function boxAgent(
	keys: BoxKeys,
	headers: Headers,
): Promise<{ agentId: string; groupId: string }> {
	const credential = headers.get(BOX_CREDENTIAL_HEADER);
	const box = credential ? await verifyBoxCredential(keys, credential) : null;
	if (!box) {
		throw new BoxRequestError(
			401,
			"unauthorized",
			"Only a Dev's box can call this",
		);
	}
	const [agent] = await db
		.select({ boxId: chatsAgents.boxId })
		.from(chatsAgents)
		.where(eq(chatsAgents.id, box.agentId));
	if (agent?.boxId !== box.boxId) {
		throw new BoxRequestError(401, "unauthorized", "This box was stopped");
	}
	const chat = chatId.safeParse(headers.get(CHAT_HEADER));
	if (!chat.success) {
		throw new BoxRequestError(
			400,
			"invalid",
			`Say which chat with the ${CHAT_HEADER} header`,
		);
	}
	return { agentId: box.agentId, groupId: chat.data };
}

/**
 * `boxAgent`, during the Dev's running turn in that chat. With `background`,
 * also after a turn there in the last two hours, acting as that turn.
 */
export async function boxTurn(
	keys: BoxKeys,
	headers: Headers,
	opts: { background?: boolean; now?: Date } = {},
): Promise<BoxClaims> {
	const { agentId, groupId } = await boxAgent(keys, headers);
	const [turn] = await db
		.select({ id: chatsTurns.id, userId: chatsTurns.userId })
		.from(chatsTurns)
		.where(
			and(
				eq(chatsTurns.agentId, agentId),
				eq(chatsTurns.groupId, groupId),
				eq(chatsTurns.status, "running"),
			),
		)
		.orderBy(desc(chatsTurns.startedAt))
		.limit(1);
	if (!turn && opts.background) {
		const since = new Date((opts.now ?? new Date()).getTime() - BACKGROUND_MS);
		const [last] = await db
			.select({ id: chatsTurns.id, userId: chatsTurns.userId })
			.from(chatsTurns)
			.where(
				and(
					eq(chatsTurns.agentId, agentId),
					eq(chatsTurns.groupId, groupId),
					gt(chatsTurns.startedAt, since),
				),
			)
			.orderBy(desc(chatsTurns.startedAt))
			.limit(1);
		if (last) {
			return {
				agentId,
				groupId,
				userId: last.userId,
				turnId: last.id,
				background: true,
			};
		}
	}
	if (!turn) {
		throw new BoxRequestError(
			403,
			"no_turn",
			"This Dev has no turn running in that chat",
		);
	}
	return { agentId, groupId, userId: turn.userId, turnId: turn.id };
}
