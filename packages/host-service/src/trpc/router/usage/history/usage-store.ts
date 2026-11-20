/** Scan state for one source (a log file or an agent database), as plain
 * JSON data. */
export interface UsageStateStore {
	get(key: string): unknown;
	set(key: string, value: unknown): void;
	delete(key: string): void;
	beginScan(): void;
	/** Drops the keys this scan did not use. */
	endScan(): void;
}

export class MemoryStateStore implements UsageStateStore {
	protected readonly values = new Map<string, unknown>();
	protected readonly dirty = new Set<string>();
	protected used = new Set<string>();

	get(key: string): unknown {
		this.used.add(key);
		return this.values.get(key);
	}

	set(key: string, value: unknown): void {
		this.used.add(key);
		this.values.set(key, value);
		this.dirty.add(key);
	}

	delete(key: string): void {
		this.used.delete(key);
		this.values.delete(key);
		this.dirty.delete(key);
	}

	beginScan(): void {
		this.used = new Set();
	}

	endScan(): void {
		for (const key of this.values.keys()) {
			if (!this.used.has(key)) this.values.delete(key);
		}
		this.dirty.clear();
	}
}
