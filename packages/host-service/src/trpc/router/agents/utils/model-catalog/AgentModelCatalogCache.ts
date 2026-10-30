import type { AgentModelCatalog } from "@superset/shared/agent-models";

interface Entry {
	at: number;
	catalog: AgentModelCatalog | null;
}

export interface AgentModelCatalogCacheOptions {
	ttlMs: number;
	failureTtlMs: number;
	now?: () => number;
}

/**
 * Live catalogs per agent config. Reads stay synchronous (`peek`) because
 * launch validation is; the async entry points `load` first. A failed read is
 * kept for a shorter time so a missing or logged-out CLI is not spawned on
 * every picker open.
 */
export class AgentModelCatalogCache {
	private readonly entries = new Map<string, Entry>();
	private readonly inflight = new Map<
		string,
		Promise<AgentModelCatalog | null>
	>();
	private readonly now: () => number;

	constructor(private readonly options: AgentModelCatalogCacheOptions) {
		this.now = options.now ?? Date.now;
	}

	peek(key: string): AgentModelCatalog | null {
		return this.entries.get(key)?.catalog ?? null;
	}

	async load(
		key: string,
		discover: () => Promise<AgentModelCatalog>,
	): Promise<AgentModelCatalog | null> {
		const entry = this.entries.get(key);
		if (entry && this.now() - entry.at < this.ttlOf(entry)) {
			return entry.catalog;
		}
		const pending = this.inflight.get(key);
		if (pending) return pending;
		const request = discover()
			.then((catalog) => (catalog.models.length > 0 ? catalog : null))
			.catch((error: unknown) => {
				console.warn(`[agent-model-catalog] ${key}:`, error);
				return null;
			})
			.then((catalog) => {
				// A failed refresh keeps the last good catalog: the CLI being busy
				// for a moment is no reason to fall back to the curated list.
				const kept = catalog ?? entry?.catalog ?? null;
				this.entries.set(key, { at: this.now(), catalog: kept });
				return kept;
			})
			.finally(() => this.inflight.delete(key));
		this.inflight.set(key, request);
		return request;
	}

	private ttlOf(entry: Entry): number {
		return entry.catalog ? this.options.ttlMs : this.options.failureTtlMs;
	}
}
