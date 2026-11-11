type Listener<E> = (event: E) => void;

interface Run<E> {
	listeners: Set<Listener<E>>;
	last: E | null;
	controller: AbortController;
	finished: Promise<void>;
}

export type StartInstall<E> = (
	emit: (event: E) => void,
	signal: AbortSignal,
) => Promise<E>;

/**
 * One install per tool at a time. A second caller (onboarding, a chat card,
 * Settings, Try again) joins the running install and gets its latest event,
 * so no two installs touch the same files. The install is cancelled only when
 * every caller has left; a caller that comes after that waits for it to stop.
 */
export function createSingleInstall<E>() {
	const runs = new Map<string, Run<E>>();

	return function subscribe(
		key: string,
		start: StartInstall<E>,
		listener: Listener<E>,
	): () => void {
		let run = runs.get(key);
		if (run && !run.controller.signal.aborted) {
			if (run.last) listener(run.last);
		} else {
			const previous = run?.finished ?? Promise.resolve();
			const created: Run<E> = {
				listeners: new Set(),
				last: null,
				controller: new AbortController(),
				finished: Promise.resolve(),
			};
			const emit = (event: E) => {
				created.last = event;
				for (const each of created.listeners) each(event);
			};
			created.finished = previous
				.then(() =>
					created.controller.signal.aborted
						? undefined
						: start(emit, created.controller.signal).then(emit),
				)
				.catch(() => {})
				.finally(() => {
					if (runs.get(key) === created) runs.delete(key);
				});
			runs.set(key, created);
			run = created;
		}
		const joined = run;
		joined.listeners.add(listener);
		return () => {
			joined.listeners.delete(listener);
			if (joined.listeners.size === 0) joined.controller.abort();
		};
	};
}
