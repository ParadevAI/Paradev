import type {
	HostUsageObservation,
	UsageAccount,
} from "shared/host-usage-observation";

interface Source {
	key: string;
	scope?: string;
	load: (force: boolean) => Promise<UsageAccount[]>;
}
interface Entry {
	key: string;
	scope?: string;
	observation: HostUsageObservation;
	pending?: Promise<HostUsageObservation>;
	forced: boolean;
	queuedForce?: Promise<HostUsageObservation | null>;
	lastForced: number;
}
const MAX_OBSERVED_HOSTS = 128;
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
				if (
					!previous.observation.offline ||
					previous.pending ||
					previous.observation.loading
				) {
					const disconnected: Entry = {
						...previous,
						pending: undefined,
						queuedForce: undefined,
						forced: false,
						observation: {
							...previous.observation,
							version: ++version,
							loading: false,
							offline: true,
						},
					};
					entries.set(hostUrl, disconnected);
					publish(disconnected.observation);
					return { source: null, entry: disconnected };
				}
				return { source: null, entry: previous };
			}
			return null;
		}
		if (previous?.key === source.key && previous.scope === source.scope)
			return { source, entry: previous };
		const sameScope = source.scope
			? [...entries].filter(
					([url, entry]) => url !== hostUrl && entry.scope === source.scope,
				)
			: [];
		const retained =
			source.scope && previous?.scope === source.scope
				? previous
				: sameScope.at(-1)?.[1];
		const retired: HostUsageObservation[] = [];
		const retire = (url: string) => {
			entries.delete(url);
			retired.push({
				hostUrl: url,
				version: ++version,
				data: null,
				loading: false,
				offline: true,
				invalidated: true,
			});
		};
		for (const [url] of sameScope) retire(url);
		while (!entries.has(hostUrl) && entries.size >= MAX_OBSERVED_HOSTS) {
			const oldest = entries.keys().next().value;
			if (oldest === undefined) break;
			retire(oldest);
		}
		const entry: Entry = {
			forced: false,
			key: source.key,
			scope: source.scope,
			observation: {
				hostUrl,
				version: ++version,
				data: null,
				loading: false,
				offline: false,
				invalidated: !!previous || sameScope.length > 0,
			},
			lastForced: retained?.lastForced ?? -Infinity,
		};
		entries.set(hostUrl, entry);
		for (const observation of retired) publish(observation);
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
		const operation = Promise.resolve()
			.then(() => {
				const latest = current(hostUrl);
				if (latest?.entry !== entry || !latest.source)
					throw new Error("Usage source changed before the request.");
				return source.load(manual);
			})
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
		publish(entry.observation);
		return operation;
	}
	return {
		peek(hostUrl: string) {
			return current(hostUrl)?.entry.observation ?? null;
		},
		read,
		invalidate(onlyHostUrl?: string) {
			const invalidated = [...entries].filter(
				([url]) => !onlyHostUrl || url === onlyHostUrl,
			);
			for (const [hostUrl, previous] of invalidated) {
				const entry: Entry = {
					key: previous.key,
					scope: previous.scope,
					forced: false,
					lastForced: previous.lastForced,
					observation: {
						hostUrl,
						version: ++version,
						data: null,
						loading: false,
						offline: true,
						invalidated: true,
					},
				};
				entries.set(hostUrl, entry);
			}
			for (const [hostUrl] of invalidated) {
				const entry = entries.get(hostUrl);
				if (entry) publish(entry.observation);
			}
		},
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
