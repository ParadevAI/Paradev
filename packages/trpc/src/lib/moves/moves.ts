import {
	type ChatMove,
	type MoveBookOp,
	type MoveBookRefusalCode,
	type MoveBookReplyFor,
	type MoveBookRequest,
	type MoveBookResponse,
	moveBookPath,
	type WorkspaceMove,
} from "@superset/shared/move-book";
import { TRPCError } from "@trpc/server";
import { env } from "../../env";

type Dated<T> = Omit<T, "createdAt" | "updatedAt" | "finishedAt"> & {
	createdAt: Date;
	updatedAt: Date;
	finishedAt: Date | null;
};

export type SelectChatMove = Dated<ChatMove>;
export type SelectWorkspaceMove = Dated<WorkspaceMove>;

export type MoveStore = (
	organizationId: string,
	request: MoveBookRequest,
) => Promise<MoveBookResponse>;

const REFUSAL_CODES = {
	conflict: "CONFLICT",
	precondition: "PRECONDITION_FAILED",
	not_found: "NOT_FOUND",
	invalid: "BAD_REQUEST",
} as const satisfies Record<MoveBookRefusalCode, TRPCError["code"]>;

const callRealtime: MoveStore = async (organizationId, request) => {
	let response: Response;
	try {
		response = await fetch(
			`${env.REALTIME_URL}${moveBookPath(organizationId)}`,
			{
				method: "POST",
				headers: {
					authorization: `Bearer ${env.REALTIME_NUDGE_SECRET}`,
					"content-type": "application/json",
				},
				body: JSON.stringify(request),
				signal: AbortSignal.timeout(10_000),
			},
		);
	} catch (error) {
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: "Moves are unreachable",
			cause: error,
		});
	}
	const body = (await response
		.json()
		.catch(() => null)) as MoveBookResponse | null;
	if (!response.ok || !body) {
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: `Moves refused the call (${response.status})`,
		});
	}
	return body;
};

let store: MoveStore = callRealtime;

/** Points every move call at another store, such as one in this process. */
export function setMoveStore(next: MoveStore): void {
	store = next;
}

/** Runs one request against the organization's moves; a refusal throws. */
export async function callMoves<Request extends MoveBookRequest>(
	organizationId: string,
	request: Request,
): Promise<Dates<MoveBookReplyFor<Request["op"] & MoveBookOp>>> {
	const response = await store(organizationId, request);
	if (!response.ok) {
		throw new TRPCError({
			code: REFUSAL_CODES[response.code],
			message: response.message,
		});
	}
	return withDates(response) as Dates<
		MoveBookReplyFor<Request["op"] & MoveBookOp>
	>;
}

type Dates<T> = T extends ChatMove
	? SelectChatMove
	: T extends WorkspaceMove
		? SelectWorkspaceMove
		: T extends (infer Item)[]
			? Dates<Item>[]
			: T extends object
				? { [Key in keyof T]: Dates<T[Key]> }
				: T;

function withDates(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(withDates);
	if (!value || typeof value !== "object") return value;
	if ("createdAt" in value && "updatedAt" in value) {
		const move = value as ChatMove | WorkspaceMove;
		return {
			...move,
			createdAt: new Date(move.createdAt),
			updatedAt: new Date(move.updatedAt),
			finishedAt: move.finishedAt === null ? null : new Date(move.finishedAt),
		};
	}
	return Object.fromEntries(
		Object.entries(value).map(([key, entry]) => [key, withDates(entry)]),
	);
}
