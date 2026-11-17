import { describeDev, renderMentions } from "@superset/chats-core";
import { db, dbWs } from "@superset/db/client";
import {
	chatsAgentReads,
	chatsAgents,
	chatsGroupAgents,
	chatsGroupMembers,
	chatsGroups,
	chatsMessages,
	chatsTurns,
	users,
} from "@superset/db/schema";
import { chatsGroupChannel } from "@superset/shared/chats-realtime";
import {
	and,
	asc,
	desc,
	eq,
	gt,
	inArray,
	isNotNull,
	isNull,
	lt,
	ne,
	sql,
} from "drizzle-orm";
import { publishChats } from "../publish";
import { messageView, sharedFiles, toUser } from "../views";
import { mayUseParadev, turnApps } from "./app-access";
import { type BoxKeys, signBoxCredential } from "./box-tokens";
import type { Box, BoxProvider, RunnerClient, TurnStart } from "./boxes";
import { textWithFile } from "./dev-files";
import { type Claim, TURN_MAX_MS, type TurnOutcome } from "./flow";
import { loadRoster, mentionableDevs, resolveMentions } from "./roster";

/** A request to run a Dev in a group because of a message. */
export interface TurnRequest {
	agentId: string;
	groupId: string;
	messageId: string;
}

/**
 * How turns run: one run per turn. The `settled` and `free` signals wake a
 * turn's run early; a run that misses one finds out on its next check.
 */
export interface TurnRuns {
	start(turnId: string): Promise<{ outcome: () => Promise<TurnOutcome> }>;
	/** After the idle timeout, stops the Dev's box unless it worked since. */
	idleStop(agentId: string): Promise<void>;
	/** The runner reported the turn settled, or a newer message superseded it. */
	settled(turnId: string): Promise<void>;
	/** The Dev may be free: the queued turn should check again. */
	free(turnId: string): Promise<void>;
}

export interface TurnDeps {
	boxes: BoxProvider;
	runner: RunnerClient;
	turnRuns: TurnRuns;
	/** Signs each box's credential and the tokens it accepts. */
	boxKeys: () => Promise<BoxKeys>;
	/** Where a box reaches the API's routes for boxes. */
	boxApiUrl: string;
	/**
	 * Decides whether one of a group's Devs should answer a message nobody
	 * addressed, and which. Absent where there is no key for it: the group
	 * then stays quiet unless a Dev is mentioned.
	 */
	speakUp?: (input: {
		group: string;
		sender: string;
		text: string;
		recent: { author: string; text: string }[];
		devs: { id: string; name: string; description: string }[];
	}) => Promise<string | null>;
	/** No model key: boxes run the scripted model, so the loop still works end to end. */
	fauxModel: boolean;
	idleTimeoutMs: number;
	now?: () => Date;
}

/** How long one Dev's question to another waits for a busy Dev before giving up. */
const ASK_WAIT_MS = 120_000;
/** A queued message turn waits as long as a turn may take, so a long turn in another group delays it and does not drop it. */
const TURN_WAIT_MS = TURN_MAX_MS;
/** A running turn older than this no longer blocks its Dev: its run was lost, and a stuck row must not lock the Dev forever. */
const STALE_TURN_MS = TURN_MAX_MS + 5 * 60_000;
const REASON_MAX = 160;

type AgentRow = typeof chatsAgents.$inferSelect;
type TurnRow = typeof chatsTurns.$inferSelect;
type Status = AgentRow["status"];

const nowOf = (deps: Pick<TurnDeps, "now">) => deps.now?.() ?? new Date();

function shortReason(error: unknown): string {
	const line =
		(error instanceof Error ? error.message : String(error)).split("\n")[0] ||
		"something went wrong";
	return line.length > REASON_MAX ? `${line.slice(0, REASON_MAX - 1)}…` : line;
}

async function findTurn(turnId: string): Promise<TurnRow | null> {
	const [turn] = await db
		.select()
		.from(chatsTurns)
		.where(eq(chatsTurns.id, turnId));
	return turn ?? null;
}

/** Sets the Dev's box status and tells the chat. */
async function setStatus(
	agentId: string,
	groupId: string,
	status: Status,
	fields: Partial<AgentRow> = {},
) {
	await db
		.update(chatsAgents)
		.set({ status, ...fields })
		.where(eq(chatsAgents.id, agentId));
	publishChats(chatsGroupChannel(groupId), {
		type: "dev.status",
		devId: agentId,
		groupId,
		status,
	});
}

const turnEvent = (turn: TurnRow) => ({
	devId: turn.agentId,
	groupId: turn.groupId,
	turnId: turn.id,
	...(turn.parentTurnId ? { parentTurnId: turn.parentTurnId } : {}),
});

/**
 * A message for a Dev in a group: queues a turn and supersedes the one that
 * Dev has queued or running there, so a new message cancels and restarts.
 * Taken under the Dev's row lock, as claims are.
 */
export async function enqueueTurn(
	deps: TurnDeps,
	request: TurnRequest,
): Promise<void> {
	const { turnId, replaced } = await dbWs.transaction(async (tx) => {
		await tx
			.select({ id: chatsAgents.id })
			.from(chatsAgents)
			.where(eq(chatsAgents.id, request.agentId))
			.for("update");
		const replaced = await tx
			.update(chatsTurns)
			.set({ superseded: true })
			.where(
				and(
					eq(chatsTurns.agentId, request.agentId),
					eq(chatsTurns.groupId, request.groupId),
					inArray(chatsTurns.status, ["queued", "running"]),
					isNotNull(chatsTurns.messageId),
				),
			)
			.returning({ id: chatsTurns.id, status: chatsTurns.status });
		const [turn] = await tx
			.insert(chatsTurns)
			.values(request)
			.returning({ id: chatsTurns.id });
		if (!turn) throw new Error("The turn was not stored");
		return { turnId: turn.id, replaced };
	});
	await Promise.all(
		replaced.map((turn) =>
			turn.status === "running"
				? deps.turnRuns.settled(turn.id)
				: deps.turnRuns.free(turn.id),
		),
	);
	await deps.turnRuns.start(turnId);
}

/**
 * Step 1: take the Dev if it is free. One turn runs per Dev at a time: the
 * Dev's row lock serializes claims, and a running turn of the Dev anywhere
 * makes this one wait. A superseded turn, or one that waited too long, ends here.
 */
export async function claimTurn(
	deps: TurnDeps,
	turnId: string,
): Promise<Claim> {
	return dbWs.transaction(async (tx): Promise<Claim> => {
		const [turn] = await tx
			.select()
			.from(chatsTurns)
			.where(eq(chatsTurns.id, turnId));
		if (!turn || turn.status === "ended") {
			return { kind: "done", outcome: { cancelled: true } };
		}
		if (turn.status === "running") return { kind: "run" };
		await tx
			.select({ id: chatsAgents.id })
			.from(chatsAgents)
			.where(eq(chatsAgents.id, turn.agentId))
			.for("update");
		const now = nowOf(deps);
		const [current] = await tx
			.select({ superseded: chatsTurns.superseded })
			.from(chatsTurns)
			.where(eq(chatsTurns.id, turnId));
		if (!current || current.superseded) {
			await tx
				.update(chatsTurns)
				.set({ status: "ended", endedAt: now })
				.where(eq(chatsTurns.id, turnId));
			return { kind: "done", outcome: { cancelled: true } };
		}
		const [busy] = await tx
			.select({ id: chatsTurns.id })
			.from(chatsTurns)
			.where(
				and(
					eq(chatsTurns.agentId, turn.agentId),
					eq(chatsTurns.status, "running"),
					ne(chatsTurns.id, turnId),
					gt(chatsTurns.startedAt, new Date(now.getTime() - STALE_TURN_MS)),
				),
			)
			.limit(1);
		if (busy) {
			const wait = turn.parentTurnId ? ASK_WAIT_MS : TURN_WAIT_MS;
			if (now.getTime() - turn.createdAt.getTime() < wait) {
				return { kind: "wait" };
			}
			const error = "it was busy for too long";
			await tx
				.update(chatsTurns)
				.set({ status: "ended", error, endedAt: now })
				.where(eq(chatsTurns.id, turnId));
			return { kind: "done", outcome: { error, busy: true } };
		}
		await tx
			.update(chatsTurns)
			.set({ status: "running", startedAt: now })
			.where(eq(chatsTurns.id, turnId));
		return { kind: "run" };
	});
}

/**
 * Who the Dev is, for the box's prompt: its kind, the group it serves or the
 * person it belongs to, and its description as others read it. Read at wake,
 * so a rename shows in the next box.
 */
async function identityEnv(agent: AgentRow): Promise<Record<string, string>> {
	if (agent.kind === "group" || agent.kind === "added") {
		const [group] = agent.groupId
			? await db
					.select({ title: chatsGroups.title })
					.from(chatsGroups)
					.where(eq(chatsGroups.id, agent.groupId))
			: [];
		if (!group) return {};
		return {
			DEV_KIND: agent.kind,
			DEV_GROUP_NAME: group.title,
			DEV_DESCRIPTION: agent.description,
		};
	}
	const [owner] = agent.ownerUserId
		? await db.select().from(users).where(eq(users.id, agent.ownerUserId))
		: [];
	if (!owner) return {};
	const ownerName = toUser(owner).displayName;
	return {
		DEV_KIND: agent.kind,
		DEV_OWNER_NAME: ownerName,
		DEV_DESCRIPTION: describeDev(agent, agent.description, {
			isOwner: false,
			ownerName,
		}),
	};
}

/** The Dev's box, woken with a new id when it is stopped. */
async function ensureBox(
	deps: TurnDeps,
	agentId: string,
	groupId: string,
): Promise<Box> {
	const running = await deps.boxes.status(agentId);
	if (running) return running;
	await setStatus(agentId, groupId, "waking");
	const [agent] = await db
		.select()
		.from(chatsAgents)
		.where(eq(chatsAgents.id, agentId));
	if (!agent) throw new Error("the Dev is gone");
	const keys = await deps.boxKeys();
	const boxId = `box_${crypto.randomUUID()}`;
	return deps.boxes.wake(agentId, {
		boxId,
		credential: await signBoxCredential(keys, { agentId, boxId }),
		env: {
			DEV_API_URL: deps.boxApiUrl,
			DEV_BOX_PUBLIC_KEY: keys.publicKeyText,
			DEV_NAME: agent.name,
			...(await identityEnv(agent)),
			...(deps.fauxModel ? { DEV_FAUX_MODEL: "1" } : {}),
		},
	});
}

/** Step 2: the Dev's box, woken if stopped, and `turn.started`. False when the box did not start. */
export async function wakeForTurn(
	deps: TurnDeps,
	turnId: string,
): Promise<boolean> {
	const turn = await findTurn(turnId);
	if (!turn) return false;
	let box: Box;
	try {
		box = await ensureBox(deps, turn.agentId, turn.groupId);
	} catch (error) {
		console.error(`[chats] turn ${turnId}: the box did not start:`, error);
		await db
			.update(chatsTurns)
			.set({ error: "its box didn't start" })
			.where(eq(chatsTurns.id, turnId));
		return false;
	}
	await db
		.update(chatsTurns)
		.set({ boxId: box.id })
		.where(eq(chatsTurns.id, turnId));
	await setStatus(turn.agentId, turn.groupId, "running", { boxId: box.id });
	publishChats(chatsGroupChannel(turn.groupId), {
		type: "turn.started",
		...turnEvent(turn),
	});
	return true;
}

/**
 * The last line of a turn's header when the turn may answer in the chat: only
 * `reply` speaks there.
 */
const REPLY_HINT =
	"To answer in the chat, call `reply` with your message (or run `dev reply \"<message>\"`). Keep it short: a sentence or two, about 60 words unless they asked for detail. If nothing here needs you, don't reply. Your final text isn't shown.";

const formatTime = (at: Date) =>
	`${at.toISOString().slice(0, 16).replace("T", " ")} UTC`;

/** What happened, as a title, then one `Field: value` line each, empty ones left out. */
const turnHeader = (
	title: string,
	fields: [string, string | null | undefined][],
) =>
	[
		`## ${title}`,
		...fields.flatMap(([name, value]) => (value ? [`${name}: ${value}`] : [])),
	].join("\n");

/** How many cut-off messages a turn takes up again. Older ones have likely moved on. */
const INTERRUPTED_MAX = 5;

/**
 * Messages this Dev's turns in the chat were answering when a newer message
 * replaced them, since its last reply there. A replaced turn posts nothing,
 * so without this the restarted turn answers only the newest message.
 */
async function interrupted(
	agentId: string,
	message: typeof chatsMessages.$inferSelect,
) {
	const [lastReply] = await db
		.select({ createdAt: chatsMessages.createdAt })
		.from(chatsMessages)
		.where(
			and(
				eq(chatsMessages.groupId, message.groupId),
				eq(chatsMessages.authorAgentId, agentId),
			),
		)
		.orderBy(desc(chatsMessages.createdAt))
		.limit(1);
	const rows = await db
		.select({ text: chatsMessages.text, sender: users })
		.from(chatsTurns)
		.innerJoin(chatsMessages, eq(chatsMessages.id, chatsTurns.messageId))
		.leftJoin(users, eq(users.id, chatsMessages.authorId))
		.where(
			and(
				eq(chatsTurns.agentId, agentId),
				eq(chatsTurns.groupId, message.groupId),
				eq(chatsTurns.superseded, true),
				isNull(chatsTurns.taskId),
				ne(chatsMessages.id, message.id),
				lastReply
					? gt(chatsMessages.createdAt, lastReply.createdAt)
					: undefined,
			),
		)
		.orderBy(asc(chatsMessages.createdAt));
	return rows.slice(-INTERRUPTED_MAX).map((row) => ({
		from: row.sender ? toUser(row.sender).displayName : "someone",
		text: row.text,
	}));
}

/** Whether this Dev wrote one of the few messages before this one, a moment ago. */
async function spokeJustBefore(
	agentId: string,
	message: typeof chatsMessages.$inferSelect,
): Promise<boolean> {
	const before = await db
		.select({
			agentId: chatsMessages.authorAgentId,
			createdAt: chatsMessages.createdAt,
		})
		.from(chatsMessages)
		.where(
			and(
				eq(chatsMessages.groupId, message.groupId),
				lt(chatsMessages.createdAt, message.createdAt),
			),
		)
		.orderBy(desc(chatsMessages.createdAt))
		.limit(4);
	return before.some(
		(row) =>
			row.agentId === agentId &&
			message.createdAt.getTime() - row.createdAt.getTime() <= 10 * 60_000,
	);
}

/**
 * A new message's turn: where and from whom, whether this Dev was mentioned
 * or why it was picked, when, then the message with mentions as names. Null
 * when the message is gone.
 */
async function messageTurnText(turn: TurnRow) {
	if (!turn.messageId) return null;
	const [row] = await db
		.select({ message: chatsMessages, author: users, chat: chatsGroups })
		.from(chatsMessages)
		.innerJoin(chatsGroups, eq(chatsGroups.id, chatsMessages.groupId))
		.leftJoin(users, eq(users.id, chatsMessages.authorId))
		.where(eq(chatsMessages.id, turn.messageId));
	if (!row) return null;
	const [roster, people] = await Promise.all([
		loadRoster(turn.groupId),
		db
			.select({ user: users })
			.from(chatsGroupMembers)
			.innerJoin(users, eq(users.id, chatsGroupMembers.userId))
			.where(eq(chatsGroupMembers.groupId, turn.groupId)),
	]);
	const names = new Map<string, string>([
		...roster.map((dev) => [dev.id, dev.name] as const),
		...people.map(({ user }) => [user.id, toUser(user).displayName] as const),
	]);
	let mentions: string | null = null;
	let why: string | null = null;
	if (row.chat.kind !== "direct") {
		const mentioned = resolveMentions(
			row.message.text,
			mentionableDevs(roster),
		).ids;
		const me = mentioned.includes(turn.agentId);
		const others = roster
			.filter((dev) => dev.id !== turn.agentId && mentioned.includes(dev.id))
			.map((dev) => dev.name);
		mentions = [...(me ? ["you"] : []), ...others].join(", ") || null;
		if (!me) {
			why = (await spokeJustBefore(turn.agentId, row.message))
				? "not mentioned, but it follows your reply here a moment ago. Reply only if it asks something of you; when people are talking to each other, don't reply"
				: "not mentioned; picked as the Dev best placed to answer";
		}
	}
	const header = turnHeader("New message", [
		[
			"Chat",
			row.chat.kind === "direct"
				? `your 1:1 with ${people.map(({ user }) => toUser(user).displayName).join(", ") || "its owner"}`
				: `the group "${row.chat.title}"`,
		],
		["From", row.author ? toUser(row.author).displayName : "someone"],
		["Message id", `#${row.message.id.slice(0, 8)}`],
		["Mentions", mentions],
		["Why you", why],
		["Time", formatTime(row.message.createdAt)],
	]);
	const body = textWithFile(
		renderMentions(row.message.text, (ref) => names.get(ref.id) ?? "someone"),
		(await sharedFiles([row.message])).get(row.message.fileId ?? ""),
	);
	const cut = await interrupted(turn.agentId, row.message);
	const unanswered = cut.length
		? `\n\nYour turns for these earlier messages were cut off by newer ones before you replied. Answer them too, in the same reply:\n${cut
				.map(
					(entry) =>
						`- ${entry.from}: ${renderMentions(entry.text, (ref) => names.get(ref.id) ?? "someone")}`,
				)
				.join("\n")}`
		: "";
	return {
		userId: row.message.authorId,
		text: `${header}\n${REPLY_HINT}\n\n${body}${unanswered}`,
	};
}

/**
 * Whether the runner asks the turn once, when it ends with words but no
 * reply, if they were meant for the chat: a 1:1's turn, and a group's when
 * the Dev was mentioned. Otherwise the Dev is overhearing people, and its
 * final text is why it stays quiet.
 */
async function checksReply(turn: TurnRow): Promise<boolean> {
	const [group] = await db
		.select({ kind: chatsGroups.kind })
		.from(chatsGroups)
		.where(eq(chatsGroups.id, turn.groupId));
	if (group?.kind === "direct" || !turn.messageId) return true;
	const [message] = await db
		.select({ text: chatsMessages.text })
		.from(chatsMessages)
		.where(eq(chatsMessages.id, turn.messageId));
	if (!message) return false;
	const mentionable = mentionableDevs(await loadRoster(turn.groupId));
	return resolveMentions(message.text, mentionable).ids.includes(turn.agentId);
}

/**
 * Whether the turn is in a 1:1 between a Dev and its owner. Never a group
 * turn, and never a group's Dev, which has no owner.
 */
async function isOwnerOneToOne(turn: TurnRow): Promise<boolean> {
	if (turn.parentTurnId) return false;
	const [row] = await db
		.select({ kind: chatsGroups.kind })
		.from(chatsAgents)
		.innerJoin(
			chatsGroupMembers,
			and(
				eq(chatsGroupMembers.groupId, turn.groupId),
				eq(chatsGroupMembers.userId, chatsAgents.ownerUserId),
			),
		)
		.innerJoin(chatsGroups, eq(chatsGroups.id, turn.groupId))
		.where(eq(chatsAgents.id, turn.agentId));
	return row?.kind === "direct";
}

/** Whether another Dev asks this one something in a chat its owner is in. */
async function isDevAsk(turn: TurnRow): Promise<boolean> {
	if (!turn.parentTurnId) return false;
	const [row] = await db
		.select({ id: chatsAgents.id })
		.from(chatsAgents)
		.innerJoin(
			chatsGroupMembers,
			and(
				eq(chatsGroupMembers.groupId, turn.groupId),
				eq(chatsGroupMembers.userId, chatsAgents.ownerUserId),
			),
		)
		.where(eq(chatsAgents.id, turn.agentId));
	return row !== undefined;
}

/**
 * One Dev's question to another that is in the same chat. The asked Dev runs
 * a turn of its own and its final text comes back to the asker only: it does
 * not post in the chat.
 */
export async function askDev(
	deps: TurnDeps,
	asker: {
		turnId: string;
		agentId: string;
		groupId: string;
		userId: string | null;
	},
	target: string,
	question: string,
): Promise<string> {
	const roster = await loadRoster(asker.groupId);
	const others = roster.filter((dev) => dev.id !== asker.agentId);
	const wanted = target.trim().toLowerCase();
	const named = others.filter(
		(dev) => dev.id === wanted || dev.name.toLowerCase() === wanted,
	);
	const [asked] = named;
	if (!asked) throw new AskError(404, "That Dev isn't in this chat");
	if (named.length > 1) {
		throw new AskError(
			409,
			`Several Devs here are called "${target}". Ask one by its id: ${named.map((dev) => dev.id).join(", ")}`,
		);
	}
	const [[group], people] = await Promise.all([
		db
			.select({ kind: chatsGroups.kind, title: chatsGroups.title })
			.from(chatsGroups)
			.where(eq(chatsGroups.id, asker.groupId)),
		db
			.select({ user: users })
			.from(chatsGroupMembers)
			.innerJoin(users, eq(users.id, chatsGroupMembers.userId))
			.where(eq(chatsGroupMembers.groupId, asker.groupId)),
	]);
	const from = roster.find((dev) => dev.id === asker.agentId)?.name ?? "A Dev";
	const header = turnHeader(`Question from ${from}, a Dev in this chat`, [
		[
			"Chat",
			group?.kind === "direct"
				? `your 1:1 with ${people.map(({ user }) => toUser(user).displayName).join(", ")}`
				: `the group "${group?.title ?? ""}"`,
		],
		["Time", formatTime(nowOf(deps))],
	]);
	const [turn] = await db
		.insert(chatsTurns)
		.values({
			agentId: asked.id,
			groupId: asker.groupId,
			prompt: `${header}\n\n${question}\n\nAnswer in plain text as your final message, as briefly as you can; it is passed back to them, not posted in the chat. Don't post in the chat either (no reply, no updates).`,
			userId: asker.userId,
			parentTurnId: asker.turnId,
		})
		.returning({ id: chatsTurns.id });
	if (!turn) throw new Error("The question was not stored");
	const run = await deps.turnRuns.start(turn.id);
	const outcome = await run.outcome();
	if ("answer" in outcome) return outcome.answer;
	if ("busy" in outcome)
		throw new AskError(409, "That Dev is busy; try again in a bit");
	throw new Error(
		"error" in outcome ? outcome.error : "the question was cancelled",
	);
}

/** A box that cannot say counts as idle, so it is not kept forever. */
const boxBusy = (deps: TurnDeps, box: Box) =>
	deps.runner.busy(box).catch((error: unknown) => {
		console.error(
			`[chats] box ${box.id} did not say whether it is busy:`,
			error,
		);
		return false;
	});

/**
 * Work a Dev left running in a chat ended while no turn ran there: the
 * runner's notices, as a turn that may reply.
 */
export async function enqueueNoticeTurn(
	deps: TurnDeps,
	claims: { agentId: string; groupId: string; userId: string | null },
	notices: string,
): Promise<void> {
	const header = `${turnHeader("Background notice", [["Time", formatTime(nowOf(deps))]])}\n${REPLY_HINT}`;
	const [turn] = await db
		.insert(chatsTurns)
		.values({
			agentId: claims.agentId,
			groupId: claims.groupId,
			userId: claims.userId,
			prompt: `${header}\n\nWork you ran in the background ended (a system notice, not a message from anyone in the chat). Tell the chat what came of it if they're waiting on it; if it failed, say so and what you'll do.\n\n${notices}`,
		})
		.returning({ id: chatsTurns.id });
	if (!turn) throw new Error("The notice was not stored");
	await deps.turnRuns.start(turn.id);
}

/** Why a question to another Dev was refused, with the status the box hears. */
export class AskError extends Error {
	constructor(
		readonly status: number,
		message: string,
	) {
		super(message);
	}
}

/** The Dev has been given the chat up to now: it has seen it. */
async function markAgentRead(agentId: string, groupId: string) {
	const [latest] = await db
		.select({ id: chatsMessages.id, createdAt: chatsMessages.createdAt })
		.from(chatsMessages)
		.where(eq(chatsMessages.groupId, groupId))
		.orderBy(desc(chatsMessages.createdAt), desc(chatsMessages.id))
		.limit(1);
	if (!latest) return;
	const [read] = await db
		.insert(chatsAgentReads)
		.values({
			agentId,
			groupId,
			lastReadMessageId: latest.id,
			lastReadMessageAt: latest.createdAt,
		})
		.onConflictDoUpdate({
			target: [chatsAgentReads.agentId, chatsAgentReads.groupId],
			set: {
				lastReadMessageId: latest.id,
				lastReadMessageAt: latest.createdAt,
				lastReadAt: sql`now()`,
			},
			setWhere: sql`(${chatsAgentReads.lastReadMessageAt}, ${chatsAgentReads.lastReadMessageId}) < (excluded.last_read_message_at, excluded.last_read_message_id)`,
		})
		.returning();
	if (!read) return;
	publishChats(chatsGroupChannel(groupId), {
		type: "chat.read",
		groupId,
		userId: null,
		devId: agentId,
		messageId: read.lastReadMessageId,
		messageAt: read.lastReadMessageAt.toISOString(),
		at: read.lastReadAt.toISOString(),
	});
}

/** A chat's latest messages as a Dev reads them, oldest first, and the people and Devs in it. */
export async function chatForDev(groupId: string, limit: number) {
	const [roster, people, rows] = await Promise.all([
		loadRoster(groupId),
		db
			.select({ user: users, role: chatsGroupMembers.role })
			.from(chatsGroupMembers)
			.innerJoin(users, eq(users.id, chatsGroupMembers.userId))
			.where(eq(chatsGroupMembers.groupId, groupId)),
		db
			.select({ message: chatsMessages, author: users, agent: chatsAgents })
			.from(chatsMessages)
			.leftJoin(users, eq(users.id, chatsMessages.authorId))
			.leftJoin(chatsAgents, eq(chatsAgents.id, chatsMessages.authorAgentId))
			.where(eq(chatsMessages.groupId, groupId))
			.orderBy(desc(chatsMessages.createdAt))
			.limit(limit),
	]);
	const names = new Map<string, string>([
		...roster.map((dev) => [dev.id, dev.name] as const),
		...people.map(({ user }) => [user.id, toUser(user).displayName] as const),
	]);
	const shared = await sharedFiles(rows.map(({ message }) => message));
	return {
		people: people.map(({ user, role }) => ({
			id: user.id,
			name: toUser(user).displayName,
			role,
		})),
		devs: roster,
		messages: rows.reverse().map(({ message, author, agent }) => ({
			id: message.id,
			author: agent?.name ?? (author ? toUser(author).displayName : "note"),
			text: textWithFile(
				renderMentions(message.text, (ref) => names.get(ref.id) ?? "someone"),
				shared.get(message.fileId ?? ""),
			),
			at: message.createdAt.toISOString(),
		})),
	};
}

/** How many messages before the turn's own a Dev is given. */
const RECENT_MESSAGES = 20;
const LINE_MAX = 600;

/**
 * The chat around a turn: the latest messages before the turn's own, oldest
 * first, each `seen` when an earlier turn of this Dev here started after it,
 * and who is in the chat.
 */
async function turnChat(turn: TurnRow): Promise<TurnStart["chat"]> {
	const [roster, [previous], rows] = await Promise.all([
		loadRoster(turn.groupId),
		db
			.select({ startedAt: chatsTurns.startedAt })
			.from(chatsTurns)
			.where(
				and(
					eq(chatsTurns.agentId, turn.agentId),
					eq(chatsTurns.groupId, turn.groupId),
					ne(chatsTurns.id, turn.id),
					isNotNull(chatsTurns.startedAt),
				),
			)
			.orderBy(desc(chatsTurns.startedAt))
			.limit(1),
		db
			.select({ message: chatsMessages, author: users, agent: chatsAgents })
			.from(chatsMessages)
			.leftJoin(users, eq(users.id, chatsMessages.authorId))
			.leftJoin(chatsAgents, eq(chatsAgents.id, chatsMessages.authorAgentId))
			.where(
				and(
					eq(chatsMessages.groupId, turn.groupId),
					turn.messageId ? ne(chatsMessages.id, turn.messageId) : undefined,
				),
			)
			.orderBy(desc(chatsMessages.createdAt))
			.limit(RECENT_MESSAGES),
	]);
	const names = new Map(roster.map((dev) => [dev.id, dev.name]));
	const seenBefore = previous?.startedAt ?? null;
	const recentFiles = await sharedFiles(rows.map(({ message }) => message));
	return {
		roster: roster
			.map(
				(dev) =>
					`- ${dev.name} (${dev.kind} Dev${mayUseParadev(dev) ? ", can act in Paradev for its owner" : ""})`,
			)
			.join("\n"),
		recent: rows.reverse().map(({ message, author, agent }) => {
			const who = agent?.name ?? (author ? toUser(author).displayName : "note");
			const said = textWithFile(
				renderMentions(message.text, (ref) => names.get(ref.id) ?? "someone"),
				recentFiles.get(message.fileId ?? ""),
			);
			return {
				line: `- ${who}: ${said.length > LINE_MAX ? `${said.slice(0, LINE_MAX - 1)}…` : said}`,
				seen: seenBefore !== null && message.createdAt < seenBefore,
			};
		}),
	};
}

async function appsFor(agentId: string) {
	const [row] = await db
		.select({ agent: chatsAgents, owner: users })
		.from(chatsAgents)
		.leftJoin(users, eq(users.id, chatsAgents.ownerUserId))
		.where(eq(chatsAgents.id, agentId));
	if (!row) return [];
	return turnApps(row.agent, row.owner ? toUser(row.owner).displayName : null);
}

/** Step 3: hands the turn to the runner. False when there is nothing to run or the box refused it. */
export async function startTurn(
	deps: TurnDeps,
	turnId: string,
): Promise<boolean> {
	const turn = await findTurn(turnId);
	if (!turn || turn.superseded) return false;
	const prompt = turn.messageId
		? await messageTurnText(turn)
		: turn.prompt
			? { text: turn.prompt, userId: turn.userId }
			: null;
	if (!prompt) return false;
	try {
		const box = await deps.boxes.status(turn.agentId);
		if (!box) throw new Error("its box stopped");
		await db
			.update(chatsTurns)
			.set({ userId: prompt.userId })
			.where(eq(chatsTurns.id, turnId));
		await deps.runner.start(box, {
			turnId,
			agentId: turn.agentId,
			groupId: turn.groupId,
			sessionId: turn.groupId,
			text: prompt.text,
			checkReply: turn.parentTurnId ? false : await checksReply(turn),
			ownerOneToOne: await isOwnerOneToOne(turn),
			devAsk: await isDevAsk(turn),
			apps: await appsFor(turn.agentId),
			chat: await turnChat(turn),
		});
		await markAgentRead(turn.agentId, turn.groupId).catch((error: unknown) =>
			console.error(`[chats] turn ${turnId}: the read was not stored:`, error),
		);
		return true;
	} catch (error) {
		console.error(`[chats] turn ${turnId} did not start:`, error);
		await db
			.update(chatsTurns)
			.set({ error: shortReason(error) })
			.where(eq(chatsTurns.id, turnId));
		return false;
	}
}

/**
 * A Dev's message in its turn's chat: the only way it speaks. Ignored when
 * the turn is no longer running or a newer message replaced it. `endsTurn`
 * marks its reply, which ends the turn's live view.
 */
export async function postDevMessage(
	claims: { turnId: string; agentId: string },
	input: { text: string; endsTurn: boolean },
): Promise<boolean> {
	const turn = await findTurn(claims.turnId);
	if (
		!turn ||
		turn.agentId !== claims.agentId ||
		turn.status !== "running" ||
		turn.superseded ||
		turn.parentTurnId
	) {
		return false;
	}
	const [repeat] = await db
		.select({ id: chatsMessages.id })
		.from(chatsMessages)
		.where(
			and(
				eq(chatsMessages.turnId, turn.id),
				eq(chatsMessages.text, input.text),
			),
		)
		.limit(1);
	if (repeat) return true;
	const [message] = await db
		.insert(chatsMessages)
		.values({
			groupId: turn.groupId,
			authorAgentId: turn.agentId,
			turnId: turn.id,
			text: input.text,
		})
		.returning();
	if (!message) return false;
	publishChats(chatsGroupChannel(turn.groupId), {
		type: "message.created",
		message: await messageView(message),
		task: null,
		...(input.endsTurn ? { endsTurn: true } : {}),
	});
	return true;
}

/** The runner's report that a turn settled. Records the answer or the error once, then wakes the turn's run. */
export async function settleTurn(
	deps: TurnDeps,
	claims: { turnId: string; agentId: string },
	result: { answer?: string; error?: string },
): Promise<void> {
	await db
		.update(chatsTurns)
		.set({
			settledAt: nowOf(deps),
			answer: result.answer ?? null,
			...(result.error ? { error: shortReason(result.error) } : {}),
		})
		.where(
			and(
				eq(chatsTurns.id, claims.turnId),
				eq(chatsTurns.agentId, claims.agentId),
				eq(chatsTurns.status, "running"),
				isNull(chatsTurns.settledAt),
			),
		);
	await deps.turnRuns.settled(claims.turnId);
}

/** Whether the runner's callback, or a newer message, already ended the wait. */
export async function isTurnSettled(turnId: string): Promise<boolean> {
	const turn = await findTurn(turnId);
	return (
		!turn ||
		turn.settledAt !== null ||
		turn.superseded ||
		turn.status === "ended"
	);
}

function outcomeOf(turn: TurnRow | null): TurnOutcome {
	if (!turn || turn.superseded) return { cancelled: true };
	if (turn.error) return { error: turn.error };
	return { answer: turn.answer ?? "" };
}

/**
 * Step 4, however the turn went: stops it on the box if it never settled,
 * marks the Dev idle (stopped if its box never woke), publishes `turn.ended`,
 * lets the Dev's next queued turn go and schedules the idle stop. A turn that
 * failed leaves a note in the chat saying why.
 */
export async function finishTurn(
	deps: TurnDeps,
	turnId: string,
	opts: { timedOut: boolean },
): Promise<TurnOutcome> {
	const turn = await findTurn(turnId);
	if (!turn) return { cancelled: true };
	if (turn.status !== "ended") {
		const box = turn.boxId ? await deps.boxes.status(turn.agentId) : null;
		if (!turn.settledAt && box && (turn.superseded || opts.timedOut)) {
			await deps.runner
				.cancel(box, { sessionId: turn.groupId })
				.catch((error: unknown) =>
					console.error(`[chats] turn ${turnId} was not cancelled:`, error),
				);
		}
		const error = turn.superseded
			? null
			: (turn.error ??
				(opts.timedOut && !turn.settledAt ? "it took too long" : null));
		const now = nowOf(deps);
		if (turn.boxId) {
			await setStatus(turn.agentId, turn.groupId, "idle", {
				lastActiveAt: now,
			});
		} else {
			await setStatus(turn.agentId, turn.groupId, "stopped", { boxId: null });
		}
		publishChats(chatsGroupChannel(turn.groupId), {
			type: "turn.ended",
			...turnEvent(turn),
			...(error ? { error } : {}),
		});
		const ended = await db
			.update(chatsTurns)
			.set({ status: "ended", endedAt: now, error })
			.where(and(eq(chatsTurns.id, turnId), ne(chatsTurns.status, "ended")))
			.returning({ id: chatsTurns.id });
		if (ended.length > 0 && error && !turn.parentTurnId) {
			await postNote(turn, error);
		}
	}
	const queued = await db
		.select({ id: chatsTurns.id })
		.from(chatsTurns)
		.where(
			and(
				eq(chatsTurns.agentId, turn.agentId),
				eq(chatsTurns.status, "queued"),
			),
		);
	await Promise.all(queued.map((next) => deps.turnRuns.free(next.id)));
	if (turn.boxId) await deps.turnRuns.idleStop(turn.agentId);
	return outcomeOf(await findTurn(turnId));
}

/** A line with no author, which clients show as a centred note. */
async function postNote(turn: TurnRow, error: string) {
	const [agent] = await db
		.select({ name: chatsAgents.name })
		.from(chatsAgents)
		.where(eq(chatsAgents.id, turn.agentId));
	const [note] = await db
		.insert(chatsMessages)
		.values({
			groupId: turn.groupId,
			text: `${agent?.name ?? "The Dev"} couldn't reply: ${error}`,
		})
		.returning();
	if (!note) return;
	publishChats(chatsGroupChannel(turn.groupId), {
		type: "message.created",
		message: await messageView(note),
		task: null,
	});
}

/**
 * The idle stop, once the idle timeout has passed since a turn: stops the box
 * if the Dev is still idle and nothing ran since. Under the Dev's row lock, so
 * a turn claimed meanwhile waits for the stop and then wakes a fresh box.
 */
export async function stopIfIdle(
	deps: TurnDeps,
	agentId: string,
): Promise<boolean> {
	const stopped = await dbWs.transaction(async (tx) => {
		const [agent] = await tx
			.select()
			.from(chatsAgents)
			.where(eq(chatsAgents.id, agentId))
			.for("update");
		if (!agent || agent.status !== "idle") return false;
		const idleFor = agent.lastActiveAt
			? nowOf(deps).getTime() - agent.lastActiveAt.getTime()
			: deps.idleTimeoutMs;
		if (idleFor < deps.idleTimeoutMs) return false;
		const [running] = await tx
			.select({ id: chatsTurns.id })
			.from(chatsTurns)
			.where(
				and(eq(chatsTurns.agentId, agentId), eq(chatsTurns.status, "running")),
			)
			.limit(1);
		if (running) return false;
		// Its notice brings a turn, whose end schedules the idle stop again.
		const box = await deps.boxes.status(agentId);
		if (box && (await boxBusy(deps, box))) return false;
		await deps.boxes.stop(agentId);
		await tx
			.update(chatsAgents)
			.set({ status: "stopped", boxId: null })
			.where(eq(chatsAgents.id, agentId));
		return true;
	});
	if (!stopped) return false;
	const links = await db
		.select({ groupId: chatsGroupAgents.groupId })
		.from(chatsGroupAgents)
		.where(eq(chatsGroupAgents.agentId, agentId))
		.orderBy(asc(chatsGroupAgents.createdAt));
	for (const link of links) {
		publishChats(chatsGroupChannel(link.groupId), {
			type: "dev.status",
			devId: agentId,
			groupId: link.groupId,
			status: "stopped",
		});
	}
	return true;
}
