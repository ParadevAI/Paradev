import {
	cancelTurnInputSchema,
	createSessionInputSchema,
	getItemsInputSchema,
	getSessionInputSchema,
	listSessionsInputSchema,
	promptInputSchema,
	respondToApprovalInputSchema,
	setModeInputSchema,
} from "@superset/chat/protocol";
import { initTRPC, TRPCError } from "@trpc/server";
import type { ChatRuntime } from "../../index";

const t = initTRPC.create();

export const createChatCallerFactory = t.createCallerFactory;

export type ChatRouterOptions = {
	resolveCwd(workspaceId: string): string | Promise<string>;
};

const UNKNOWN_HARNESS = /^unknown harness /;
const NOT_RUNNING = /^chat session (.+) is not running$/;

function mapCommandError(runtime: ChatRuntime, error: unknown): unknown {
	if (error instanceof TRPCError) return error;
	if (!(error instanceof Error)) return error;
	if (UNKNOWN_HARNESS.test(error.message)) {
		return new TRPCError({
			code: "BAD_REQUEST",
			message: error.message,
			cause: error,
		});
	}
	const sessionId = NOT_RUNNING.exec(error.message)?.[1];
	if (sessionId) {
		return new TRPCError({
			code: runtime.sessions.get(sessionId) ? "CONFLICT" : "NOT_FOUND",
			message: error.message,
			cause: error,
		});
	}
	return error;
}

export function createChatRouter(
	runtime: ChatRuntime,
	options: ChatRouterOptions,
) {
	function guarded<T>(execute: () => T): T {
		try {
			return execute();
		} catch (error) {
			throw mapCommandError(runtime, error);
		}
	}

	return t.router({
		createSession: t.procedure
			.input(createSessionInputSchema)
			.mutation(async ({ input }) => {
				const cwd = await options.resolveCwd(input.workspaceId);
				return guarded(() => runtime.commands.createSession({ ...input, cwd }));
			}),

		prompt: t.procedure
			.input(promptInputSchema)
			.mutation(({ input }) => guarded(() => runtime.commands.prompt(input))),

		cancelTurn: t.procedure
			.input(cancelTurnInputSchema)
			.mutation(({ input }) =>
				guarded(() => runtime.commands.cancelTurn(input)),
			),

		respondToApproval: t.procedure
			.input(respondToApprovalInputSchema)
			.mutation(({ input }) =>
				guarded(() => runtime.commands.respondToApproval(input)),
			),

		setMode: t.procedure
			.input(setModeInputSchema)
			.mutation(({ input }) => guarded(() => runtime.commands.setMode(input))),

		getSession: t.procedure
			.input(getSessionInputSchema)
			.query(({ input }) => runtime.commands.getSession(input)),

		listSessions: t.procedure
			.input(listSessionsInputSchema)
			.query(({ input }) => runtime.commands.listSessions(input)),

		getItems: t.procedure
			.input(getItemsInputSchema)
			.query(({ input }) => runtime.commands.getItems(input)),
	});
}

export type ChatRouter = ReturnType<typeof createChatRouter>;
