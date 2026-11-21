import type { AgentModelCatalog } from "@superset/shared/agent-models";

type Entry = { catalog: AgentModelCatalog; expiresAt: number };

/** Shares one probe between callers and keeps its result for a short time. */
export class ModelCatalogCache {
	private entries = new Map<string, Entry>();
	private pending = new Map<string, Promise<AgentModelCatalog>>();
	constructor(
		private readonly now = Date.now,
		private readonly ttl = 60_000,
	) {}
	async get(
		key: string,
		load: () => Promise<AgentModelCatalog>,
	): Promise<AgentModelCatalog> {
		const hit = this.entries.get(key);
		if (hit && hit.expiresAt > this.now()) return hit.catalog;
		const pending = this.pending.get(key);
		if (pending) return pending;
		const work = load()
			.then((catalog) => {
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
