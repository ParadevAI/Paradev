import type { AgentModelCatalog } from "@superset/shared/agent-models";

import { discoveryFailure } from "./discovery";

type Entry = { catalog: AgentModelCatalog; expiresAt: number };
export class ModelCatalogCache {
	private entries = new Map<string, Entry>();
	private pending = new Map<string, Promise<AgentModelCatalog>>();
	constructor(
		private readonly now = Date.now,
		private readonly ttl = 60_000,
		private readonly capacity = 64,
	) {}
	peek(key: string): AgentModelCatalog | undefined {
		const entry = this.entries.get(key);
		return entry && entry.expiresAt > this.now() ? entry.catalog : undefined;
	}
	async get(
		key: string,
		load: () => Promise<AgentModelCatalog>,
		fallback: () => AgentModelCatalog,
		refresh = false,
	): Promise<AgentModelCatalog> {
		const hit = this.peek(key);
		if (hit && !refresh) return hit;
		const pending = this.pending.get(key);
		if (pending) return pending;
		if (this.pending.size >= this.capacity)
			return { ...fallback(), failure: "busy" };
		const previous = this.entries.get(key)?.catalog;
		const work = Promise.resolve()
			.then(load)
			.catch((error) => ({
				...(previous && previous.source !== "bundled"
					? { ...previous, stale: true, availability: "unknown" as const }
					: fallback()),
				failure: discoveryFailure(error),
			}))
			.then((catalog) => {
				this.entries.delete(key);
				const oldest = this.entries.keys().next().value;
				if (this.entries.size >= this.capacity && oldest)
					this.entries.delete(oldest);
				this.entries.set(key, { catalog, expiresAt: this.now() + this.ttl });
				return catalog;
			})
			.finally(() => {
				this.pending.delete(key);
			});
		this.pending.set(key, work);
		return work;
	}
}
