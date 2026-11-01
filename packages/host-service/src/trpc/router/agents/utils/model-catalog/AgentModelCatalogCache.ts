import type { AgentModelCatalog } from "@superset/shared/agent-models";

export class AgentModelCatalogCache {
	private readonly entries = new Map<string, AgentModelCatalog>();
	private readonly inflight = new Map<string, Promise<AgentModelCatalog>>();

	peek(key: string): AgentModelCatalog | null {
		return this.entries.get(key) ?? null;
	}

	async load(
		key: string,
		discover: () => Promise<AgentModelCatalog>,
	): Promise<AgentModelCatalog> {
		const pending = this.inflight.get(key);
		if (pending) return pending;
		const request = discover()
			.then((catalog) => {
				this.entries.delete(key);
				this.entries.set(key, catalog);
				const oldest = this.entries.keys().next().value;
				if (this.entries.size > 32 && oldest !== undefined)
					this.entries.delete(oldest);
				return catalog;
			})
			.catch((error: unknown) => {
				this.entries.delete(key);
				throw error;
			})
			.finally(() => this.inflight.delete(key));
		this.inflight.set(key, request);
		return request;
	}
}
