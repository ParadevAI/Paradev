import type {
	HostUsageObservation,
	UsageAccount,
} from "shared/host-usage-observation";

interface Source {
	key: string;
	load: (force: boolean) => Promise<UsageAccount[]>;
}
interface Entry {
	key: string;
	observation: HostUsageObservation;
	pending?: Promise<HostUsageObservation>;
	forced: boolean;
	queuedForce?: Promise<HostUsageObservation | null>;
	lastForced: number;
}
export function createHostUsageStore(
	resolve: (hostUrl: string) => Source | null,
	now = Date.now,
) {
	let version = 0;
	const entries = new Map<string, Entry>();
	const listeners = new Set<(value: HostUsageObservation) => void>();
	const publish = (value: HostUsageObservation) => {
		for (const listener of listeners) {
			try {
				listener(value);
			} catch {
				/* One closed subscriber must not discard the observation. */
			}
		}
	};
	function current(hostUrl: string) {
		const source = resolve(hostUrl);
		const previous = entries.get(hostUrl);
		if (!source) {
			if (previous) {
				if (!previous.observation.offline) {
					previous.observation = {
						...previous.observation,
						version: ++version,
						loading: false,
						offline: true,
					};
					publish(previous.observation);
				}
				return { source: null, entry: previous };
			}
			return null;
		}
		if (previous?.key === source.key) return { source, entry: previous };
		const entry: Entry = {
			forced: false,
			key: source.key,
			observation: {
				hostUrl,
				version: ++version,
				data: null,
				loading: false,
				offline: false,
				invalidated: !!previous,
			},
			lastForced: -Infinity,
		};
		entries.set(hostUrl, entry);
		publish(entry.observation);
		return { source, entry };
	}
	async function read(
		hostUrl: string,
		force = false,
	): Promise<HostUsageObservation | null> {
		const active = current(hostUrl);
		if (!active) return null;
		const { source, entry } = active;
		if (!source) return entry.observation;
		const manual = force && now() - entry.lastForced >= 30_000;
		if (entry.pending) {
			if (!manual || entry.forced) return entry.pending;
			if (entry.queuedForce) return entry.queuedForce;
			const queued = entry.pending
				.then(() => {
					const latest = current(hostUrl);
					if (latest?.entry !== entry || !latest.source)
						return latest?.entry.observation ?? null;
					return read(hostUrl, true);
				})
				.finally(() => {
					if (entry.queuedForce === queued) entry.queuedForce = undefined;
				});
			entry.queuedForce = queued;
			return queued;
		}
		entry.forced = manual;
		if (manual) entry.lastForced = now();
		entry.observation = {
			...entry.observation,
			version: ++version,
			loading: true,
		};
		publish(entry.observation);
		const operation = Promise.resolve()
			.then(() => source.load(manual))
			.then(
				(data) => ({ data, offline: false }),
				() => ({ data: entry.observation.data, offline: true }),
			)
			.then((result) => {
				const latest = current(hostUrl);
				if (
					latest?.entry !== entry ||
					!latest.source ||
					latest.source.key !== source.key
				) {
					if (latest?.entry === entry) entry.pending = undefined;
					return (
						latest?.entry.observation ?? {
							hostUrl,
							version: ++version,
							data: null,
							loading: false,
							offline: true,
						}
					);
				}
				entry.pending = undefined;
				entry.observation = {
					hostUrl,
					version: ++version,
					...result,
					loading: false,
				};
				publish(entry.observation);
				return entry.observation;
			});
		entry.pending = operation;
		return operation;
	}
	return {
		peek(hostUrl: string) {
			return current(hostUrl)?.entry.observation ?? null;
		},
		read,
		subscribe(listener: (value: HostUsageObservation) => void) {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
		clear(onlyHostUrl?: string) {
			const removed = [...entries].filter(
				([url]) => !onlyHostUrl || url === onlyHostUrl,
			);
			for (const [url] of removed) entries.delete(url);
			for (const [hostUrl, _entry] of removed) {
				publish({
					hostUrl,
					version: ++version,
					data: null,
					loading: false,
					offline: true,
					invalidated: true,
				});
			}
		},
	};
}
