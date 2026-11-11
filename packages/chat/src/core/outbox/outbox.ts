import type { UserContent } from "../../protocol/items";

export type OutboxEntryState = "queued" | "inflight" | "failed";

/** How the entry reaches a running turn: `steer` interrupts one it cannot join, `join` queues. */
export type PromptDelivery = {
	steer?: { expectedTurnId: string };
	join?: { expectedTurnId: string };
};

export type OutboxEntry = {
	commandId: string;
	clientId: string;
	content: UserContent[];
	state: OutboxEntryState;
	attempts: number;
	lastError: string | null;
} & PromptDelivery;

export type OutboxOptions = {
	send: (entry: OutboxEntry) => Promise<void>;
	canSend?: () => boolean;
	mintId?: () => string;
	maxAttempts?: number;
};

export class Outbox {
	private entries = new Map<string, OutboxEntry>();
	private listeners = new Set<() => void>();
	private readonly send: OutboxOptions["send"];
	private readonly canSend: () => boolean;
	private readonly mintId: () => string;
	private readonly maxAttempts: number;

	constructor(options: OutboxOptions) {
		this.send = options.send;
		this.canSend = options.canSend ?? (() => true);
		this.mintId = options.mintId ?? (() => crypto.randomUUID());
		this.maxAttempts = options.maxAttempts ?? 5;
	}

	enqueue(content: UserContent[], delivery: PromptDelivery = {}): OutboxEntry {
		const entry: OutboxEntry = {
			commandId: this.mintId(),
			clientId: this.mintId(),
			content,
			...(delivery.steer ? { steer: delivery.steer } : {}),
			...(delivery.join ? { join: delivery.join } : {}),
			state: "queued",
			attempts: 0,
			lastError: null,
		};
		this.entries.set(entry.clientId, entry);
		this.notify();
		return entry;
	}

	async flush(): Promise<void> {
		for (const clientId of [...this.entries.keys()]) {
			if (!this.canSend()) break;
			const entry = this.entries.get(clientId);
			if (!entry || entry.state === "inflight") continue;
			if (entry.attempts >= this.maxAttempts) continue;
			this.update(entry.clientId, {
				state: "inflight",
				attempts: entry.attempts + 1,
			});
			try {
				await this.send(this.entries.get(entry.clientId) ?? entry);
				const current = this.entries.get(entry.clientId);
				if (current && current.state === "inflight") {
					this.update(entry.clientId, { state: "queued", lastError: null });
				}
			} catch (error) {
				this.update(entry.clientId, {
					state: "failed",
					lastError: error instanceof Error ? error.message : String(error),
				});
			}
		}
	}

	confirm(clientId: string): boolean {
		const removed = this.entries.delete(clientId);
		if (removed) this.notify();
		return removed;
	}

	retry(clientId: string): void {
		const entry = this.entries.get(clientId);
		if (entry && entry.state === "failed") {
			this.update(clientId, { state: "queued", attempts: 0 });
		}
	}

	discard(clientId: string): boolean {
		const removed = this.entries.delete(clientId);
		if (removed) this.notify();
		return removed;
	}

	snapshot(): OutboxEntry[] {
		return [...this.entries.values()];
	}

	subscribe(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	private update(clientId: string, patch: Partial<OutboxEntry>): void {
		const entry = this.entries.get(clientId);
		if (!entry) return;
		this.entries.set(clientId, { ...entry, ...patch });
		this.notify();
	}

	private notify(): void {
		for (const listener of this.listeners) listener();
	}
}
