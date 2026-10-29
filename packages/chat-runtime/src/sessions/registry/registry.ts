import { randomUUID } from "node:crypto";
import type { DiscoverSessionsResult, Envelope } from "@superset/chat/protocol";
import type {
	DiscoverNativeSessionsInput,
	HarnessAdapter,
} from "../../harness";
import type { ChatJournal } from "../../journal";
import type { UnfinishedSession } from "../liveSession";
import { LiveSession } from "../liveSession";

export type HarnessFactoryOptions = {
	sessionId: string;
	scopeId: string;
	harness: string;
	cwd: string;
	modeId?: string;
	modelId?: string;
	resume?: { harnessSessionId: string; quiet?: boolean };
	terminalId?: string;
};

export type HarnessFactory = (options: HarnessFactoryOptions) => HarnessAdapter;

export type HarnessRegistry = Map<string, HarnessFactory>;

export type LiveSessionObserver = {
	started(options: HarnessFactoryOptions): void;
	published(envelope: Envelope, session: LiveSession): void;
	stopped(sessionId: string): void;
};

export type LiveSessionRegistryOptions = {
	journal: ChatJournal;
	publish: (envelope: Envelope) => void;
	harnesses: HarnessRegistry;
	observer?: LiveSessionObserver;
	mintId?: () => string;
	now?: () => number;
};

export class LiveSessionRegistry {
	private readonly live = new Map<string, LiveSession>();

	constructor(private readonly options: LiveSessionRegistryOptions) {}

	supports(harness: string): boolean {
		return this.options.harnesses.has(harness);
	}

	/**
	 * Lists native harness history. Reuses a live adapter for the same harness
	 * and workspace when one is up; otherwise builds a temporary adapter from
	 * the registry factory and disposes it. Does not open a journal session.
	 */
	async discoverSessions(input: {
		harness: string;
		scopeId: string;
		cwd: string;
		cursor?: string;
	}): Promise<DiscoverSessionsResult> {
		const query: DiscoverNativeSessionsInput = {
			cwd: input.cwd,
			...(input.cursor ? { cursor: input.cursor } : {}),
		};
		const reusable = [...this.live.values()].find(
			(session) =>
				session.harness === input.harness &&
				session.scopeId === input.scopeId &&
				session.state.status !== "dead" &&
				session.supportsNativeDiscovery(),
		);
		if (reusable) return reusable.discoverSessions(query);

		const factory = this.options.harnesses.get(input.harness);
		if (!factory) throw new Error(`unknown harness ${input.harness}`);
		const adapter = factory({
			sessionId: `discover-${randomUUID()}`,
			scopeId: input.scopeId,
			harness: input.harness,
			cwd: input.cwd,
		});
		let failure: unknown;
		try {
			if (!adapter.discoverSessions) {
				return { supported: false, sessions: [] };
			}
			return await adapter.discoverSessions(query);
		} catch (error) {
			failure = error;
			throw error;
		} finally {
			await adapter.dispose().catch((disposeError: unknown) => {
				if (!failure) throw disposeError;
			});
		}
	}

	create(options: HarnessFactoryOptions): LiveSession {
		const factory = this.options.harnesses.get(options.harness);
		if (!factory) throw new Error(`unknown harness ${options.harness}`);
		if (this.live.has(options.sessionId)) {
			throw new Error(`chat session ${options.sessionId} is already running`);
		}

		const observer = this.options.observer;
		const session = new LiveSession({
			sessionId: options.sessionId,
			scopeId: options.scopeId,
			harness: options.harness,
			terminalId: options.terminalId,
			journal: this.options.journal,
			publish: (envelope) => {
				this.options.publish(envelope);
				this.observe(() => observer?.published(envelope, session));
			},
			adapter: factory(options),
			mintId: this.options.mintId,
			now: this.options.now,
		});
		this.live.set(options.sessionId, session);
		this.observe(() => observer?.started(options));
		try {
			session.start({
				cwd: options.cwd,
				modeId: options.modeId,
				modelId: options.modelId,
				resume: options.resume,
			});
		} catch (error) {
			this.live.delete(options.sessionId);
			this.observe(() => observer?.stopped(options.sessionId));
			void session.dispose().catch(() => undefined);
			throw error;
		}
		return session;
	}

	private observe(notify: () => void): void {
		try {
			notify();
		} catch (error) {
			console.warn("[chat-runtime] session observer failed", error);
		}
	}

	get(sessionId: string): LiveSession | null {
		return this.live.get(sessionId) ?? null;
	}

	require(sessionId: string): LiveSession {
		const session = this.live.get(sessionId);
		if (!session) throw new Error(`chat session ${sessionId} is not running`);
		return session;
	}

	unfinished(): UnfinishedSession[] {
		return [...this.live.values()].flatMap((session) => {
			const unfinished = session.unfinished();
			return unfinished ? [unfinished] : [];
		});
	}

	async dispose(sessionId: string): Promise<void> {
		const session = this.live.get(sessionId);
		if (!session) return;
		this.live.delete(sessionId);
		this.observe(() => this.options.observer?.stopped(sessionId));
		await session.dispose();
	}

	async disposeAll(): Promise<void> {
		await this.disposeWhere(() => true);
	}

	async disposeScope(scopeId: string): Promise<string[]> {
		return this.disposeWhere((session) => session.scopeId === scopeId);
	}

	private async disposeWhere(
		matches: (session: LiveSession) => boolean,
	): Promise<string[]> {
		const sessions = [...this.live.values()].filter(matches);
		for (const session of sessions) this.live.delete(session.sessionId);
		for (const session of sessions) {
			this.observe(() => this.options.observer?.stopped(session.sessionId));
		}
		const results = await Promise.allSettled(
			sessions.map((session) => session.dispose()),
		);
		const failure = results.find((result) => result.status === "rejected");
		if (failure?.status === "rejected") throw failure.reason;
		return sessions.map((session) => session.sessionId);
	}
}
