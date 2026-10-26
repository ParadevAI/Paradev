import { isDeepStrictEqual, stripVTControlCharacters } from "node:util";
import type { ClaudeBackgroundAttachProof } from "../../../terminal-agents/claude-background-session";
import type { NativeClaudeTerminalClient } from "../../../terminal-agents/native-claude-process";
import { claimNativeSession } from "../../../terminal-agents/native-session-lease";
import type { SessionAccount } from "../usage/session-account/session-account";

export interface BackgroundReconnectInput {
	workspaceId: string;
	terminalId: string;
	expectedRevision: string;
}
export interface BackgroundReconnectSource extends BackgroundReconnectInput {
	sessionId: string;
	account: SessionAccount;
	cwd: string;
	label: string;
	reservation?: { terminalId: string; authorized: boolean };
}
export type BackgroundReconnectResult =
	| { reconnected: false }
	| {
			reconnected: true;
			confirmed: true;
			terminalId: string;
			label: string;
	  }
	| {
			reconnected: false;
			attachmentPending: true;
			terminalId: string;
			label: string;
	  };
export interface BackgroundReconnectIO {
	read(input: BackgroundReconnectInput): BackgroundReconnectSource | null;
	successor(input: BackgroundReconnectInput): BackgroundReconnectResult | null;
	verifyAccount(
		source: BackgroundReconnectSource,
		signal?: AbortSignal,
	): Promise<SessionAccount>;
	assertIdle(
		source: BackgroundReconnectSource,
		signal?: AbortSignal,
	): Promise<void>;
	prove(
		source: BackgroundReconnectSource,
		signal?: AbortSignal,
	): Promise<ClaudeBackgroundAttachProof | null>;
	attachArgs(
		proof: ClaudeBackgroundAttachProof,
		source: BackgroundReconnectSource,
		signal?: AbortSignal,
	): Promise<readonly ["attach", string]>;
	reserve(
		source: BackgroundReconnectSource,
		terminalId: string,
	): BackgroundReconnectSource;
	assertReserved(source: BackgroundReconnectSource): void;
	authorize(source: BackgroundReconnectSource): BackgroundReconnectSource;
	unclaim(source: BackgroundReconnectSource): void;
	reconcileExitedReservation?(
		source: BackgroundReconnectSource,
		signal?: AbortSignal,
	): Promise<BackgroundReconnectSource>;
	create(input: {
		source: BackgroundReconnectSource;
		terminalId: string;
		executable: string;
		args: readonly ["attach", string];
		beforeInitialCommand(): Promise<void>;
		onInitialCommandReady(): void;
	}): Promise<void>;
	admission(
		source: BackgroundReconnectSource,
		terminalId: string,
		signal?: AbortSignal,
	): Promise<{
		rootPid: number;
		client: NativeClaudeTerminalClient;
		bytes: Uint8Array;
	} | null>;
	commit(
		source: BackgroundReconnectSource,
		proof: ClaudeBackgroundAttachProof,
		client: NativeClaudeTerminalClient,
	): BackgroundReconnectResult;
	now(): number;
	uuid(): string;
	wait(): Promise<void>;
	schedule?(callback: () => void, milliseconds: number): () => void;
}

function refuse(): never {
	throw new Error(
		"The exact background conversation changed or could not be verified. Nothing was restarted.",
	);
}
function accountKey(account: SessionAccount) {
	return JSON.stringify([
		account.agent,
		account.selection,
		account.directory,
		account.identity,
		account.email,
		account.credentialKind,
		account.conflict,
	]);
}
export function admitsBackgroundAttachment(
	bytes: Uint8Array,
	id: string,
): boolean {
	if (
		bytes.byteLength === 0 ||
		bytes.byteLength > 16 * 1024 ||
		!/^[a-zA-Z0-9_-]{1,64}$/.test(id)
	)
		return false;
	let raw: string;
	try {
		raw = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
	} catch {
		return false;
	}
	const positions = ["[?1049h", "[?1047h", "[?47h"]
		.map((suffix) => raw.indexOf(String.fromCharCode(27) + suffix))
		.filter((position) => position >= 0);
	const prefix = raw.slice(
		0,
		positions.length ? Math.min(...positions) : raw.length,
	);
	const text = stripVTControlCharacters(prefix).replaceAll("\r\n", "\n");
	const banners = [...text.matchAll(/^Session ([a-zA-Z0-9_-]+) ·[^\r\n]*$/gm)];
	return (
		banners.length > 0 &&
		banners.length <= 8 &&
		banners.every((match) => match[1] === id)
	);
}

export function createBackgroundReconnect(io: BackgroundReconnectIO) {
	const operations = new Map<string, Promise<BackgroundReconnectResult>>();
	return async (
		request: BackgroundReconnectInput,
	): Promise<BackgroundReconnectResult> => {
		const input = Object.freeze({ ...request });
		const key = JSON.stringify([
			input.workspaceId,
			input.terminalId,
			input.expectedRevision,
		]);
		const existing = operations.get(key);
		if (existing) return existing;
		if (operations.size >= 128) return refuse();
		const operation = boundedReconnect(input);
		operations.set(key, operation);
		try {
			return await operation;
		} finally {
			if (operations.get(key) === operation) operations.delete(key);
		}
	};

	async function boundedReconnect(
		input: BackgroundReconnectInput,
	): Promise<BackgroundReconnectResult> {
		const controller = new AbortController();
		let current: BackgroundReconnectSource | null = null;
		let authorized = false;
		const guard = () => {
			if (controller.signal.aborted) return refuse();
		};
		let cancel: (() => void) | undefined;
		const timeout = new Promise<BackgroundReconnectResult>(
			(resolve, reject) => {
				const expired = () => {
					controller.abort();
					if (authorized && current?.reservation)
						resolve({
							reconnected: false,
							attachmentPending: true,
							terminalId: current.reservation.terminalId,
							label: current.label,
						});
					else
						reject(
							new Error(
								"Background verification timed out. Nothing was restarted.",
							),
						);
				};
				if (io.schedule) cancel = io.schedule(expired, 12_000);
				else {
					const timer = setTimeout(expired, 12_000);
					cancel = () => clearTimeout(timer);
				}
			},
		);
		const work = reconnect(
			input,
			controller.signal,
			guard,
			(source, started) => {
				current = source;
				authorized = started;
			},
		);
		try {
			return await Promise.race([work, timeout]);
		} finally {
			cancel?.();
			controller.abort();
		}
	}

	async function reconnect(
		input: BackgroundReconnectInput,
		signal: AbortSignal,
		guard: () => void,
		update: (source: BackgroundReconnectSource, authorized: boolean) => void,
	): Promise<BackgroundReconnectResult> {
		const successor = io.successor(input);
		if (successor) return successor;
		const discoveredSource = io.read(input);
		let source = discoveredSource && structuredClone(discoveredSource);
		if (!source) return { reconnected: false };
		if (
			source.expectedRevision !== input.expectedRevision ||
			source.account.agent !== "claude" ||
			source.account.credentialKind !== "subscription" ||
			!source.account.directory ||
			source.account.conflict
		)
			return refuse();
		const release = claimNativeSession("claude", source.sessionId);
		let authorized = source.reservation?.authorized ?? false;
		update(source, authorized);
		try {
			const check = async () => {
				if (
					!source ||
					accountKey(await io.verifyAccount(source, signal)) !==
						accountKey(source.account)
				)
					return refuse();
				guard();
				const current = io.read(input);
				if (!isDeepStrictEqual(current, source)) return refuse();
			};
			await check();
			if (source.reservation?.authorized && io.reconcileExitedReservation) {
				source = await io.reconcileExitedReservation(source, signal);
				guard();
				authorized = source.reservation?.authorized ?? false;
				update(source, authorized);
				await check();
			}
			await io.assertIdle(source, signal);
			guard();
			let proof = await io.prove(source, signal);
			guard();
			if (!proof) {
				if (source.reservation) return refuse();
				return { reconnected: false };
			}
			const args = Object.freeze(await io.attachArgs(proof, source, signal));
			guard();
			if (
				args[0] !== "attach" ||
				args.length !== 2 ||
				!args[1] ||
				args[1].startsWith("-") ||
				/[\r\n\0]/.test(args[1])
			)
				return refuse();
			const sameWorker = async () => {
				if (!source || !proof) return refuse();
				const fresh = await io.prove(source, signal);
				if (
					!fresh ||
					!isDeepStrictEqual(fresh.workerAfter, proof.workerAfter) ||
					!isDeepStrictEqual(await io.attachArgs(fresh, source, signal), args)
				)
					return refuse();
				proof = fresh;
				await check();
			};
			if (!source.reservation) {
				const terminalId = io.uuid();
				guard();
				source = io.reserve(source, terminalId);
				update(source, authorized);
				await io.create({
					source,
					terminalId,
					executable: proof.workerAfter.executable,
					args,
					beforeInitialCommand: async () => {
						await sameWorker();
						if (!source) return refuse();
						await io.assertIdle(source, signal);
						guard();
						io.assertReserved(source);
					},
					onInitialCommandReady: () => {
						guard();
						if (!source) return refuse();
						source = io.authorize(source);
						authorized = true;
						update(source, true);
					},
				});
			}
			const terminalId = source.reservation?.terminalId;
			if (!terminalId || !authorized) return refuse();
			const deadline = io.now() + 4_000;
			for (let attempt = 0; attempt < 40 && io.now() <= deadline; attempt++) {
				const admitted = await io.admission(source, terminalId, signal);
				guard();
				if (
					admitted &&
					admitted.client.executable === proof.workerAfter.executable &&
					admitted.client.configDir === proof.target.configDir &&
					admitted.client.cwd === proof.target.worktreePath &&
					admitted.client.ancestors.at(-1)?.pid === admitted.rootPid &&
					admitsBackgroundAttachment(admitted.bytes, proof.candidate.id)
				) {
					await sameWorker();
					const confirmed = await io.admission(source, terminalId, signal);
					if (
						!confirmed ||
						confirmed.rootPid !== admitted.rootPid ||
						!isDeepStrictEqual(confirmed.client, admitted.client) ||
						!admitsBackgroundAttachment(confirmed.bytes, proof.candidate.id)
					)
						return refuse();
					guard();
					io.assertReserved(source);
					return io.commit(source, proof, admitted.client);
				}
				await io.wait();
			}
			return {
				reconnected: false,
				attachmentPending: true,
				terminalId,
				label: source.label,
			};
		} catch (error) {
			if (!authorized && source.reservation) io.unclaim(source);
			throw error;
		} finally {
			release();
		}
	}
}
