import { observable } from "@trpc/server/observable";

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
 * One install per tool at a time, owned by the main process. Every screen
 * (onboarding, a chat card, Settings, Try again) joins the running install
 * and gets its latest event, so no two installs touch the same files. A
 * screen that closes only stops listening; only `cancel` stops the install,
 * and an install that comes after it waits for it to stop.
 */
export function createSingleInstall<E>({ cancelled }: { cancelled: E }) {
	const runs = new Map<string, Run<E>>();
	const watchers = new Map<string, Set<Listener<E>>>();

	const running = (key: string): Run<E> | undefined => {
		const run = runs.get(key);
		return run && !run.controller.signal.aborted ? run : undefined;
	};

	const listen = (run: Run<E>, listener: Listener<E>) => {
		if (run.last) listener(run.last);
		run.listeners.add(listener);
		return () => {
			run.listeners.delete(listener);
		};
	};

	return {
		/** Joins the running install, or starts one. */
		join(key: string, start: StartInstall<E>, listener: Listener<E>) {
			const current = running(key);
			if (current) return listen(current, listener);

			const previous = runs.get(key)?.finished ?? Promise.resolve();
			const run: Run<E> = {
				listeners: new Set(),
				last: null,
				controller: new AbortController(),
				finished: Promise.resolve(),
			};
			const emit = (event: E) => {
				if (run.controller.signal.aborted) return;
				run.last = event;
				for (const each of run.listeners) each(event);
			};
			run.finished = previous
				.then(() =>
					run.controller.signal.aborted
						? undefined
						: start(emit, run.controller.signal).then(emit),
				)
				.catch(() => {})
				.finally(() => {
					if (runs.get(key) === run) runs.delete(key);
				});
			runs.set(key, run);
			for (const watcher of watchers.get(key) ?? []) run.listeners.add(watcher);
			return listen(run, listener);
		},

		/** Follows this tool's installs: the running one and any started later. */
		watch(key: string, listener: Listener<E>) {
			const keyWatchers = watchers.get(key) ?? new Set();
			watchers.set(key, keyWatchers);
			keyWatchers.add(listener);
			const current = running(key);
			if (current) {
				if (current.last) listener(current.last);
				current.listeners.add(listener);
			}
			return () => {
				keyWatchers.delete(listener);
				if (keyWatchers.size === 0) watchers.delete(key);
				runs.get(key)?.listeners.delete(listener);
			};
		},

		cancel(key: string) {
			const current = running(key);
			if (!current) return;
			current.controller.abort();
			for (const each of current.listeners) each(cancelled);
			current.listeners.clear();
		},
	};
}

/**
 * Streams install events to one screen. `endAtLast` ends the stream at the
 * install's last event; a watch stays open for the installs that follow.
 */
export function installSubscription<E extends { stage: string }>(
	listen: (listener: (event: E) => void) => () => void,
	{ endAtLast = true }: { endAtLast?: boolean } = {},
) {
	return observable<E>((emit) =>
		listen((event) => {
			emit.next(event);
			if (
				endAtLast &&
				(event.stage === "done" ||
					event.stage === "failed" ||
					event.stage === "cancelled")
			) {
				emit.complete();
			}
		}),
	);
}
