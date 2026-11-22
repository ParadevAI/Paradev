import type {
	PageToolAccount,
	PageToolCallRequest,
	PageToolOutcome,
	PageToolServerReply,
} from "@superset/shared/page-tools";

export interface PageToolHost {
	callTool(request: PageToolCallRequest): Promise<PageToolServerReply>;
	grant(input: { plugin: string; connectionId?: string }): Promise<void>;
	install(plugin: string): Promise<void>;
	openUrl(url: string): void;
}

export type PageToolPrompt =
	| { kind: "grant"; pluginLabel: string; accountless?: true }
	| { kind: "install"; pluginLabel: string }
	| { kind: "connect"; pluginLabel: string }
	| { kind: "account"; pluginLabel: string; accounts: PageToolAccount[] };

export type PageToolAnswer =
	| { allow: false }
	| { allow: true; connectionId?: string };

const MAX_STEPS = 4;
const PENDING_INTERVAL_MS = 20_000;
const DENIED = "The viewer did not allow this page to use it";

function failure(
	code: Exclude<PageToolOutcome, { ok: true }>["code"],
	message: string,
): PageToolOutcome {
	return { ok: false, code, message };
}

export interface PageToolRunnerOptions {
	pendingIntervalMs?: number;
	stopped?: () => boolean;
	every?: (tick: () => void, ms: number) => () => void;
}

function everyInterval(tick: () => void, ms: number): () => void {
	const timer = setInterval(tick, ms);
	return () => clearInterval(timer);
}

export function createPageToolRunner(
	host: PageToolHost,
	askViewer: (prompt: PageToolPrompt) => Promise<PageToolAnswer>,
	{
		pendingIntervalMs = PENDING_INTERVAL_MS,
		stopped = () => false,
		every = everyInterval,
	}: PageToolRunnerOptions = {},
): (
	request: PageToolCallRequest,
	onPending?: () => void,
) => Promise<PageToolOutcome> {
	const declined = new Set<string>();
	const asking = new Map<string, Promise<PageToolAnswer>>();
	let grantsMuted = false;
	let grantQueue: Promise<unknown> = Promise.resolve();

	const ask = (prompt: PageToolPrompt): Promise<PageToolAnswer> =>
		stopped() ? Promise.resolve({ allow: false }) : askViewer(prompt);

	const askGrant = (prompt: PageToolPrompt) => {
		const answer = grantQueue.then(async (): Promise<PageToolAnswer> => {
			if (grantsMuted) return { allow: false };
			const value = await ask(prompt);
			if (!value.allow) grantsMuted = true;
			return value;
		});
		grantQueue = answer.catch(() => {});
		return answer;
	};

	const askOnce = (plugin: string, prompt: PageToolPrompt) => {
		const key = `${prompt.kind}:${plugin}`;
		let answer = asking.get(key);
		if (!answer) {
			answer = (
				prompt.kind === "grant" ? askGrant(prompt) : ask(prompt)
			).finally(() => asking.delete(key));
			asking.set(key, answer);
		}
		return answer;
	};

	const keptAlive = async <T>(
		work: () => Promise<T>,
		onPending: () => void,
	) => {
		if (stopped()) return work();
		onPending();
		const cancel = every(() => {
			if (stopped()) cancel();
			else onPending();
		}, pendingIntervalMs);
		try {
			return await work();
		} finally {
			cancel();
		}
	};

	return async (request, onPending = () => {}) => {
		const { plugin } = request;
		for (let step = 0; step < MAX_STEPS; step++) {
			if (declined.has(plugin)) return failure("denied", DENIED);
			let reply: PageToolServerReply;
			try {
				reply = await keptAlive(() => host.callTool(request), onPending);
			} catch (error) {
				return failure(
					"unavailable",
					error instanceof Error ? error.message : "The tool call failed",
				);
			}
			switch (reply.status) {
				case "ok":
					return { ok: true, result: reply.result };
				case "error":
					return failure(reply.code, reply.message);
				case "needs_connection": {
					const answer = await keptAlive(
						() =>
							askOnce(plugin, {
								kind: "connect",
								pluginLabel: reply.pluginLabel,
							}),
						onPending,
					);
					if (answer.allow) host.openUrl(reply.connectUrl);
					return failure(
						"needs_connection",
						`Connect ${reply.pluginLabel}, then try again`,
					);
				}
				case "needs_grant":
				case "needs_install":
				case "needs_account": {
					if (reply.status === "needs_grant" && grantsMuted) {
						declined.add(plugin);
						return failure("denied", DENIED);
					}
					const prompt: PageToolPrompt =
						reply.status === "needs_grant"
							? reply.accountless
								? {
										kind: "grant",
										pluginLabel: reply.pluginLabel,
										accountless: true,
									}
								: { kind: "grant", pluginLabel: reply.pluginLabel }
							: reply.status === "needs_install"
								? { kind: "install", pluginLabel: reply.pluginLabel }
								: {
										kind: "account",
										pluginLabel: reply.pluginLabel,
										accounts: reply.accounts,
									};
					const answer = await keptAlive(
						() => askOnce(plugin, prompt),
						onPending,
					);
					if (!answer.allow) {
						if (prompt.kind === "grant") declined.add(plugin);
						return prompt.kind === "install"
							? failure(
									"needs_install",
									`Install ${reply.pluginLabel} to use this page`,
								)
							: failure("denied", DENIED);
					}
					try {
						await keptAlive(
							() =>
								prompt.kind === "install"
									? host.install(plugin)
									: host.grant({ plugin, connectionId: answer.connectionId }),
							onPending,
						);
					} catch (error) {
						return failure(
							"unavailable",
							error instanceof Error ? error.message : "Setup failed",
						);
					}
					continue;
				}
				default:
					return failure("unavailable", "The host does not know this reply");
			}
		}
		return failure("unavailable", "The tool could not be set up");
	};
}
