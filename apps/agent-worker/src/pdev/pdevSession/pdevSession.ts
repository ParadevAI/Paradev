import {
	AcpRpcClient,
	type AcpServerRequest,
	spawnAcpTransport,
} from "@superset/chat-runtime/acp-client";

const STARTUP_TIMEOUT_MS = 60_000;
const CANCEL_GRACE_MS = 15_000;

export interface AcpSessionUpdate {
	sessionUpdate: string;
	[key: string]: unknown;
}

export interface PdevSessionOptions {
	command: string;
	cwd: string;
	env: NodeJS.ProcessEnv;
	/** `provider/model` for this run; a resumed session otherwise keeps the model it was made with. */
	model?: string;
	onUpdate(update: AcpSessionUpdate): void;
	onStderr?(chunk: string): void;
}

/**
 * One `pdev acp` process for one turn. It is idle when pdev reports idle and
 * no background task or subagent it started is still running, since one that
 * finishes starts a new run by itself. Subagents' own sessions share the
 * stream and are left out.
 */
export class PdevSession {
	private sessionId: string | null = null;
	private running = false;
	private readonly backgroundTasks = new Set<string>();
	private stopReason: string | null = null;
	private exit: string | null = null;
	private readonly waiters = new Set<() => void>();
	private readonly client: AcpRpcClient;

	constructor(private readonly options: PdevSessionOptions) {
		this.client = new AcpRpcClient({
			createTransport: (handlers) =>
				spawnAcpTransport(
					{
						command: options.command,
						args: ["acp"],
						cwd: options.cwd,
						env: options.env,
					},
					handlers,
				),
			onNotification: ({ method, params }) => {
				if (method !== "session/update") return;
				const { sessionId, update } = params as {
					sessionId?: string;
					update?: AcpSessionUpdate;
				};
				if (sessionId && this.sessionId && sessionId !== this.sessionId) return;
				if (update) this.observe(update);
			},
			onServerRequest: (request) => this.answer(request),
			onStderr: options.onStderr,
			onExit: (code, signal) => {
				this.exit = `pdev exited (code ${code ?? "none"}, signal ${signal ?? "none"})`;
				this.wake();
			},
		});
	}

	get id(): string | null {
		return this.sessionId;
	}

	get idle(): boolean {
		return !this.running && this.backgroundTasks.size === 0;
	}

	get lastStopReason(): string | null {
		return this.stopReason;
	}

	async open(resumeSessionId: string | null): Promise<string> {
		await this.client.request(
			"initialize",
			{
				protocolVersion: 2,
				info: { name: "superset-agent-worker", version: "1.0.0" },
				capabilities: {},
				clientCapabilities: {
					fs: { readTextFile: false, writeTextFile: false },
					terminal: false,
				},
			},
			STARTUP_TIMEOUT_MS,
		);
		if (resumeSessionId) {
			await this.client.request(
				"session/resume",
				{ sessionId: resumeSessionId, cwd: this.options.cwd, mcpServers: [] },
				STARTUP_TIMEOUT_MS,
			);
			this.sessionId = resumeSessionId;
		} else {
			const created = (await this.client.request(
				"session/new",
				{ cwd: this.options.cwd, mcpServers: [] },
				STARTUP_TIMEOUT_MS,
			)) as { sessionId: string };
			this.sessionId = created.sessionId;
		}
		if (this.options.model) {
			// A bad model setting must not stop a Dev answering: keep the session's model.
			await this.client
				.request(
					"session/set_config_option",
					{
						sessionId: this.sessionId,
						configId: "model",
						type: "id",
						value: this.options.model,
					},
					STARTUP_TIMEOUT_MS,
				)
				.catch((error: unknown) =>
					console.warn(
						`[pdev] could not switch to ${this.options.model}; keeping the session's model`,
						error instanceof Error ? error.message : error,
					),
				);
		}
		return this.sessionId;
	}

	/** Starts a run, or joins the running one as a steer. */
	async prompt(text: string): Promise<void> {
		if (!this.sessionId) throw new Error("pdev session is not open");
		this.running = true;
		this.stopReason = null;
		await this.client.request("session/prompt", {
			sessionId: this.sessionId,
			prompt: [{ type: "text", text }],
		});
	}

	/** Resolves when pdev is idle, the process exits, or `wakeEveryMs` passes. */
	waitForChange(wakeEveryMs: number): Promise<void> {
		if (this.exit) return Promise.reject(new Error(this.exit));
		return new Promise<void>((resolve, reject) => {
			const done = () => {
				clearTimeout(timer);
				this.waiters.delete(done);
				if (this.exit) reject(new Error(this.exit));
				else resolve();
			};
			const timer = setTimeout(done, wakeEveryMs);
			this.waiters.add(done);
		});
	}

	async cancel(): Promise<void> {
		if (!this.sessionId) return;
		this.client.notify("session/cancel", { sessionId: this.sessionId });
		const deadline = Date.now() + CANCEL_GRACE_MS;
		while (this.running && !this.exit && Date.now() < deadline) {
			await this.waitForChange(500).catch(() => {});
		}
	}

	close(): Promise<void> {
		return this.client.close();
	}

	private observe(update: AcpSessionUpdate): void {
		if (update.sessionUpdate === "state_update") {
			this.running = update.state === "running";
			if (typeof update.stopReason === "string")
				this.stopReason = update.stopReason;
			this.wake();
		} else if (
			update.sessionUpdate === "subagent_update" &&
			typeof update.sessionId === "string"
		) {
			const state = (update.state as { state?: string } | undefined)?.state;
			if (state === "running") this.backgroundTasks.add(update.sessionId);
			else if (state === "idle") {
				this.backgroundTasks.delete(update.sessionId);
				this.wake();
			}
		} else if (
			update.sessionUpdate === "async_task_spawned" &&
			typeof update.asyncTaskId === "string"
		) {
			this.backgroundTasks.add(update.asyncTaskId);
		} else if (
			update.sessionUpdate === "async_task_state_update" &&
			typeof update.asyncTaskId === "string" &&
			update.state !== "running"
		) {
			this.backgroundTasks.delete(update.asyncTaskId);
			this.wake();
		}
		this.options.onUpdate(update);
	}

	private answer(request: AcpServerRequest): void {
		if (request.method === "session/request_permission") {
			const options =
				(
					request.params as {
						options?: Array<{ optionId: string; kind?: string }>;
					}
				).options ?? [];
			const allow =
				options.find((option) => option.kind === "allow_once") ??
				options.find((option) => option.kind?.startsWith("allow")) ??
				options[0];
			this.client.respond(request.id, {
				outcome: allow
					? { outcome: "selected", optionId: allow.optionId }
					: { outcome: "cancelled" },
			});
			return;
		}
		if (request.method === "elicitation/create") {
			this.client.respond(request.id, { action: "decline" });
			return;
		}
		this.client.respondWithError(
			request.id,
			-32601,
			`${request.method} is not supported by the agent worker`,
		);
	}

	private wake(): void {
		for (const waiter of [...this.waiters]) waiter();
	}
}
