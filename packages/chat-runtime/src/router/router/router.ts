import {
	backgroundSubagentInputSchema,
	type ChatAccountSelection,
	type ChatLaunchAccount,
	type ChatLaunchContext,
	cancelTurnInputSchema,
	closeSessionInputSchema,
	closeStoppedAccountSessionInputSchema,
	createAccountSessionInputSchema,
	createSessionInputSchema,
	discoverSessionsInputSchema,
	forkSessionInputSchema,
	getItemBodiesInputSchema,
	getItemsInputSchema,
	getOutlineInputSchema,
	getSessionInputSchema,
	listSessionsInputSchema,
	promptInputSchema,
	queuedPromptInputSchema,
	recoverAccountSessionInputSchema,
	respondToApprovalInputSchema,
	resumeQueueInputSchema,
	rewindSessionInputSchema,
	type SwitchAccountSessionInput,
	setConfigOptionInputSchema,
	setModeInputSchema,
	steerSubagentInputSchema,
	stopBackgroundTaskInputSchema,
	switchAccountSessionInputSchema,
} from "@superset/chat/protocol";
import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";
import { initTRPC, TRPCError } from "@trpc/server";
import { z } from "zod";
import type { ChatRuntime } from "../../index";
import {
	findAccountCommand,
	findAccountSuccessor,
	readLaunchContext,
} from "../../projection/launchContext";

const t = initTRPC.create();

export const createChatCallerFactory = t.createCallerFactory;

export type PrepareAccountSwitchInput = {
	harness: string;
	account: ChatAccountSelection;
	cwd: string;
	scopeId: string;
	harnessSessionId: string;
	source: ChatLaunchContext;
};

export type ChatRouterOptions = {
	prepareAccountSwitch?(input: PrepareAccountSwitchInput): Promise<{
		finish(): Promise<{ account: ChatLaunchAccount; assertCurrent(): void }>;
		release(): void;
	}>;
	resolveCwd(workspaceId: string): string | Promise<string>;
	accountHarnesses?: readonly string[];
	prepareAccount?(input: {
		harness: string;
		account: ChatAccountSelection;
		cwd: string;
		scopeId: string;
	}): Promise<ChatLaunchAccount>;
};

const UNKNOWN_HARNESS = /^unknown harness /;
const NOT_RUNNING = /^chat session (.+) is not running$/;
const NOT_QUEUED = /^prompt .+ is not queued$/;

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
	if (NOT_QUEUED.test(error.message)) {
		return new TRPCError({
			code: "NOT_FOUND",
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
			const result = execute();
			if (result instanceof Promise) {
				return result.catch((error: unknown) => {
					throw mapCommandError(runtime, error);
				}) as T;
			}
			return result;
		} catch (error) {
			throw mapCommandError(runtime, error);
		}
	}

	const switching = new Map<
		string,
		{
			input: string;
			promise: Promise<{
				sessionId: string;
				epoch: string;
				terminalId: string;
			}>;
		}
	>();
	const claimed = new Set<string>();
	const refuseSwitch = (message: string): never => {
		throw new TRPCError({ code: "PRECONDITION_FAILED", message });
	};
	async function switchAccount(input: SwitchAccountSessionInput) {
		if (!options.prepareAccountSwitch)
			return refuseSwitch(
				"This host does not support switching chat accounts safely.",
			);
		const receipt = findAccountCommand(runtime.db, input.commandId);
		if (receipt) {
			const saved = readLaunchContext(receipt);
			if (
				!saved ||
				receipt.predecessorSessionId !== input.sessionId ||
				saved.switchOfSessionId !== input.sessionId ||
				saved.account.selection !== input.account.selection ||
				saved.account.identity !== input.account.identity
			)
				throw new TRPCError({
					code: "CONFLICT",
					message:
						"This command already belongs to another conversation or account.",
				});
			return {
				sessionId: receipt.sessionId,
				epoch: receipt.epoch,
				terminalId: saved.terminalId,
			};
		}
		// Repair the native-id projection before taking the immutable source snapshot.
		runtime.commands.getSession({ sessionId: input.sessionId });
		const source = runtime.sessions.get(input.sessionId);
		const context = source ? readLaunchContext(source) : null;
		if (
			!source ||
			!context ||
			!source.harnessSessionId ||
			!options.accountHarnesses?.includes(source.harness)
		)
			return refuseSwitch(
				"The saved conversation and its account could not be verified.",
			);
		const live = runtime.live.get(source.sessionId);
		if (
			!live ||
			live.state.harnessSessionId !== source.harnessSessionId ||
			live.terminalId !== context.terminalId
		)
			return refuseSwitch(
				"Resume this conversation with its saved account before switching accounts.",
			);
		const claim = `${source.harness}:${source.harnessSessionId}`;
		if (claimed.has(claim))
			throw new TRPCError({
				code: "CONFLICT",
				message: "This conversation is already switching accounts.",
			});
		claimed.add(claim);
		let preparation:
			| Awaited<
					ReturnType<NonNullable<ChatRouterOptions["prepareAccountSwitch"]>>
			  >
			| undefined;
		try {
			const original = JSON.stringify([
				source.epoch,
				source.scopeId,
				source.harness,
				source.harnessSessionId,
				source.launchContextJson,
			]);
			const assertSource = (running: boolean) => {
				const current = runtime.sessions.get(source.sessionId);
				if (
					!current ||
					JSON.stringify([
						current.epoch,
						current.scopeId,
						current.harness,
						current.harnessSessionId,
						current.launchContextJson,
					]) !== original ||
					findAccountSuccessor(runtime.db, source.sessionId) ||
					runtime.live.isClosing(source.sessionId) ||
					runtime.live.get(source.sessionId) !== (running ? live : null)
				)
					refuseSwitch(
						"The conversation changed or was already resumed. Nothing else was restarted.",
					);
				if (
					current.queuedCount > 0 ||
					runtime.commands.getQueue({ sessionId: source.sessionId }).prompts
						.length
				)
					refuseSwitch(
						"Review and remove queued messages before switching accounts.",
					);
				if (
					running &&
					(live.state.status !== "idle" ||
						live.turn?.status === "running" ||
						live.unfinished() !== null ||
						live.state.awaitingBackground ||
						(live.state.backgroundTasks?.length ?? 0) > 0)
				)
					refuseSwitch(
						"Finish active tools, background work and questions before switching accounts.",
					);
			};
			assertSource(true);
			if (live.state.exactResumeSupported !== true)
				return refuseSwitch(
					"This agent has not confirmed exact conversation recovery. Nothing was restarted.",
				);
			const cwd = await options.resolveCwd(source.scopeId);
			if (cwd !== context.cwd)
				return refuseSwitch(
					"The conversation's working folder changed. Nothing was restarted.",
				);
			preparation = await options.prepareAccountSwitch({
				harness: source.harness,
				account: input.account,
				cwd,
				scopeId: source.scopeId,
				harnessSessionId: source.harnessSessionId,
				source: context,
			});
			if ((await options.resolveCwd(source.scopeId)) !== cwd)
				return refuseSwitch(
					"The conversation's working folder changed. Nothing was restarted.",
				);
			assertSource(true);
			const modeId = live.state.modeId;
			const modelId = live.state.modelId;
			if (!modeId)
				return refuseSwitch(
					"The current permission mode is unknown. Nothing was restarted.",
				);
			// closeSession removes the idle source synchronously before its first await.
			await runtime.commands.closeSession({ sessionId: source.sessionId });
			const prepared = await preparation.finish();
			if (
				prepared.account.selection !== input.account.selection ||
				prepared.account.identity !== input.account.identity ||
				prepared.account.agent !== context.account.agent
			)
				return refuseSwitch(
					"The selected account changed. The saved conversation remains recoverable.",
				);
			if ((await options.resolveCwd(source.scopeId)) !== cwd)
				return refuseSwitch(
					"The conversation's working folder changed. The saved conversation remains recoverable.",
				);
			assertSource(false);
			prepared.assertCurrent();
			const created = runtime.commands.createSession({
				commandId: input.commandId,
				scopeId: source.scopeId,
				harness: source.harness,
				cwd,
				terminalId: context.terminalId,
				modeId,
				...(modelId ? { modelId } : {}),
				predecessorSessionId: source.sessionId,
				resume: {
					harnessSessionId: source.harnessSessionId,
					requireExact: true,
				},
				launchContext: {
					...context,
					account: prepared.account,
					initialModeId: modeId,
					initialModelId: modelId,
					switchOfSessionId: source.sessionId,
				},
			});
			return { ...created, terminalId: context.terminalId };
		} finally {
			preparation?.release();
			claimed.delete(claim);
		}
	}

	return t.router({
		accountSessionByCommand: t.procedure
			.input(z.strictObject({ commandId: z.uuid() }))
			.query(({ input }) => {
				const row = findAccountCommand(runtime.db, input.commandId);
				if (!row) return null;
				const context = readLaunchContext(row);
				if (!context)
					throw new TRPCError({
						code: "PRECONDITION_FAILED",
						message: "The saved chat account is unavailable.",
					});
				return {
					sessionId: row.sessionId,
					epoch: row.epoch,
					terminalId: context.terminalId,
				};
			}),
		accountCapabilities: t.procedure.query(() => ({
			version: 1 as const,
			accountSwitch: Boolean(options.prepareAccountSwitch),
			harnesses: options.prepareAccount
				? [...(options.accountHarnesses ?? [])]
				: [],
		})),

		createAccountSession: t.procedure
			.input(createAccountSessionInputSchema)
			.mutation(async ({ input }) => {
				if (
					!options.prepareAccount ||
					!options.accountHarnesses?.includes(input.harness)
				)
					throw new TRPCError({
						code: "PRECONDITION_FAILED",
						message:
							"This host does not support account selection for this chat agent.",
					});
				const receipt = findAccountCommand(runtime.db, input.commandId);
				if (receipt) {
					const context = readLaunchContext(receipt);
					if (
						!context ||
						context.forkOfSessionId !== undefined ||
						receipt.predecessorSessionId !== null ||
						receipt.scopeId !== input.workspaceId ||
						receipt.harness !== input.harness ||
						context.account.selection !== input.account.selection ||
						context.account.identity !== input.account.identity ||
						context.initialModeId !== input.modeId ||
						context.initialModelId !== input.modelId
					)
						throw new TRPCError({
							code: "CONFLICT",
							message:
								"This command already belongs to another conversation or account.",
						});
					return {
						sessionId: receipt.sessionId,
						epoch: receipt.epoch,
						terminalId: context.terminalId as string,
					};
				}
				const cwd = await options.resolveCwd(input.workspaceId);
				const account = await options.prepareAccount({
					harness: input.harness,
					account: input.account,
					cwd,
					scopeId: input.workspaceId,
				});
				if (
					account.selection !== input.account.selection ||
					account.identity !== input.account.identity
				)
					throw new TRPCError({
						code: "PRECONDITION_FAILED",
						message: "The selected chat account changed. Nothing was launched.",
					});
				const concurrent = findAccountCommand(runtime.db, input.commandId);
				if (concurrent) {
					const context = readLaunchContext(concurrent);
					if (
						!context ||
						context.forkOfSessionId !== undefined ||
						concurrent.predecessorSessionId !== null ||
						concurrent.scopeId !== input.workspaceId ||
						concurrent.harness !== input.harness ||
						context.account.selection !== input.account.selection ||
						context.account.identity !== input.account.identity ||
						context.initialModeId !== input.modeId ||
						context.initialModelId !== input.modelId
					)
						throw new TRPCError({
							code: "CONFLICT",
							message:
								"This command already belongs to another conversation or account.",
						});
					return {
						sessionId: concurrent.sessionId,
						epoch: concurrent.epoch,
						terminalId: context.terminalId,
					};
				}
				const terminalId = crypto.randomUUID();
				const created = guarded(() =>
					runtime.commands.createSession({
						commandId: input.commandId,
						scopeId: input.workspaceId,
						harness: input.harness,
						cwd,
						terminalId,
						modeId: input.modeId,
						modelId: input.modelId,
						launchContext: {
							v: 1,
							cwd,
							terminalId,
							account,
							initialModeId: input.modeId,
							initialModelId: input.modelId,
						},
					}),
				);
				return { ...created, terminalId };
			}),

		switchAccountSession: t.procedure
			.input(switchAccountSessionInputSchema)
			.mutation(({ input }) => {
				const signature = JSON.stringify(input);
				const prior = switching.get(input.commandId);
				if (prior) {
					if (prior.input !== signature)
						throw new TRPCError({
							code: "CONFLICT",
							message: "This command already belongs to another account.",
						});
					return prior.promise;
				}
				const promise = switchAccount(input).finally(() =>
					switching.delete(input.commandId),
				);
				switching.set(input.commandId, { input: signature, promise });
				return promise;
			}),

		recoverAccountSession: t.procedure
			.input(recoverAccountSessionInputSchema)
			.mutation(({ input }) => runtime.commands.recoverAccountSession(input)),

		createSession: t.procedure
			.input(
				createSessionInputSchema.extend({
					account: z.never().optional(),
					launchContext: z.never().optional(),
				}),
			)
			.mutation(async ({ input }) => {
				const { workspaceId, ...rest } = input;
				const cwd = await options.resolveCwd(workspaceId);
				return guarded(() =>
					runtime.commands.createSession({
						...rest,
						scopeId: workspaceId,
						cwd,
					}),
				);
			}),

		prompt: t.procedure
			.input(promptInputSchema)
			.mutation(({ input }) => guarded(() => runtime.commands.prompt(input))),

		removeQueuedPrompt: t.procedure
			.input(queuedPromptInputSchema)
			.mutation(({ input }) =>
				guarded(() => runtime.commands.removeQueuedPrompt(input)),
			),

		steerQueuedPrompt: t.procedure
			.input(queuedPromptInputSchema)
			.mutation(({ input }) =>
				guarded(() => runtime.commands.steerQueuedPrompt(input)),
			),

		resumeQueue: t.procedure
			.input(resumeQueueInputSchema)
			.mutation(({ input }) =>
				guarded(() => runtime.commands.resumeQueue(input)),
			),

		cancelTurn: t.procedure
			.input(cancelTurnInputSchema)
			.mutation(({ input }) =>
				guarded(() => runtime.commands.cancelTurn(input)),
			),

		stopBackgroundTask: t.procedure
			.input(stopBackgroundTaskInputSchema)
			.mutation(({ input }) =>
				guarded(() => runtime.commands.stopBackgroundTask(input)),
			),

		steerSubagent: t.procedure
			.input(steerSubagentInputSchema)
			.mutation(async ({ input }) => ({
				result: (await guarded(() => runtime.commands.steerSubagent(input)))
					? ("steered" as const)
					: ("finished" as const),
			})),

		backgroundSubagent: t.procedure
			.input(backgroundSubagentInputSchema)
			.mutation(async ({ input }) => ({
				result: (await guarded(() =>
					runtime.commands.backgroundSubagent(input),
				))
					? ("moved" as const)
					: ("refused" as const),
			})),

		respondToApproval: t.procedure
			.input(respondToApprovalInputSchema)
			.mutation(({ input }) =>
				guarded(() => runtime.commands.respondToApproval(input)),
			),

		setMode: t.procedure
			.input(setModeInputSchema)
			.mutation(({ input }) => guarded(() => runtime.commands.setMode(input))),

		setConfigOption: t.procedure
			.input(setConfigOptionInputSchema)
			.mutation(({ input }) =>
				guarded(() => runtime.commands.setConfigOption(input)),
			),

		forkSession: t.procedure
			.input(forkSessionInputSchema.extend({ workspaceId: z.string().min(1) }))
			.mutation(async ({ input }) => {
				const { workspaceId, ...rest } = input;
				const cwd = await options.resolveCwd(workspaceId);
				return guarded(() => runtime.commands.forkSession({ ...rest, cwd }));
			}),

		rewindSession: t.procedure
			.input(
				rewindSessionInputSchema.extend({ workspaceId: z.string().min(1) }),
			)
			.mutation(async ({ input }) => {
				const { workspaceId, ...rest } = input;
				const cwd = await options.resolveCwd(workspaceId);
				return guarded(() => runtime.commands.rewindSession({ ...rest, cwd }));
			}),
		closeStoppedAccountSession: t.procedure
			.input(closeStoppedAccountSessionInputSchema)
			.mutation(({ input }) =>
				runtime.commands.closeStoppedAccountSession(input),
			),

		closeSession: t.procedure
			.input(closeSessionInputSchema)
			.mutation(({ input }) => runtime.commands.closeSession(input)),

		getSession: t.procedure
			.input(getSessionInputSchema)
			.query(({ input }) => runtime.commands.getSession(input)),

		getQueue: t.procedure
			.input(getSessionInputSchema)
			.query(({ input }) => runtime.commands.getQueue(input)),

		listSessions: t.procedure
			.input(listSessionsInputSchema)
			.query(({ input }) =>
				runtime.commands.listSessions({
					limit: input.limit,
					...(input.workspaceId === undefined
						? {}
						: { scopeId: input.workspaceId }),
				}),
			),

		discoverSessions: t.procedure
			.input(discoverSessionsInputSchema)
			.query(async ({ input }) => {
				const cwd = await options.resolveCwd(input.workspaceId);
				try {
					return await runtime.commands.discoverSessions({
						harness: input.harness,
						scopeId: input.workspaceId,
						cwd,
						...(input.cursor ? { cursor: input.cursor } : {}),
					});
				} catch (error) {
					throw mapCommandError(runtime, error);
				}
			}),

		getItems: t.procedure
			.input(getItemsInputSchema)
			.query(({ input }) => runtime.commands.getItems(input)),

		getOutline: t.procedure
			.input(getOutlineInputSchema)
			.query(({ input }) => runtime.commands.getOutline(input)),

		getItemBodies: t.procedure
			.input(getItemBodiesInputSchema)
			.query(({ input }) => runtime.commands.getItemBodies(input)),
	});
}

export type ChatRouter = ReturnType<typeof createChatRouter>;

export type ChatRouterInputs = inferRouterInputs<ChatRouter>;
export type ChatRouterOutputs = inferRouterOutputs<ChatRouter>;
