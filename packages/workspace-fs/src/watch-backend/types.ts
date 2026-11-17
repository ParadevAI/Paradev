export interface NativeWatchEvent {
	type: "create" | "update" | "delete";
	path: string;
	/** Set only by a backend that knows it when the event fires. */
	isDirectory?: boolean;
}

export interface NativeWatchSubscription {
	unsubscribe(): Promise<void>;
}

export interface NativeWatchRequest {
	/** Symlink-resolved directory to watch recursively. */
	rootPath: string;
	/** Globs relative to `rootPath`; an entry with no glob magic is a path under it. */
	ignore: string[];
	/** Unique per attach of one watcher; grows on every re-attach. */
	generation: number;
	/**
	 * Paths pruned after attach, asked again for each new entry. A backend
	 * with `watchesEachEntry` does not watch an entry for which it is true.
	 */
	isPruned?(absolutePath: string): boolean;
	onEvents(events: NativeWatchEvent[]): void;
	onError(error: unknown): void;
}

export interface NativeWatchBackend {
	readonly name: string;
	/** A dir pruned after attach keeps its per-entry watches until a re-attach. */
	readonly watchesEachEntry?: boolean;
	/** Resolves once the watch is live; rejects if it could not be established. */
	subscribe(request: NativeWatchRequest): Promise<NativeWatchSubscription>;
}
