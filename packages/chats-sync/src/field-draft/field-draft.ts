/** How long typing pauses before a task page saves it. */
const SAVE_DELAY_MS = 500;

interface Timers {
	set: (run: () => void, ms: number) => unknown;
	clear: (handle: unknown) => void;
}

const TIMERS: Timers = {
	set: (run, ms) => setTimeout(run, ms),
	clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/**
 * One field of a task edited in place (the title, the description), saved as you go: a pause in typing saves it, and
 * so does leaving the field (`blur`) or the page (`flush`).
 *
 * While you edit, the field shows what you typed and nothing else, so an edit from another device or a Dev can't
 * move the cursor or swallow a keystroke. When you leave it, the field shows the task as stored again: your last
 * unsaved typing is saved first and wins (each field is last-write-wins, and that write is the latest), while an edit
 * that arrived after your last save, with nothing typed since, is what you then see. Merging inside a field would need
 * a shared text model on every client for little gain in a title or a short description; waiting for blur is
 * predictable instead.
 */
export function createFieldDraft<T>({
	save,
	delayMs = SAVE_DELAY_MS,
	timers = TIMERS,
}: {
	save: (value: T) => void;
	delayMs?: number;
	timers?: Timers;
}) {
	let local: { value: T } | null = null;
	let unsaved = false;
	let timer: unknown = null;
	let version = 0;
	const listeners = new Set<() => void>();
	const changed = () => {
		version++;
		for (const listener of listeners) listener();
	};
	const stopTimer = () => {
		if (timer !== null) timers.clear(timer);
		timer = null;
	};
	const flush = () => {
		stopTimer();
		if (!unsaved || !local) return;
		unsaved = false;
		save(local.value);
	};

	return {
		/** What the field shows: what's being typed, else the task as stored. */
		shown: (stored: T): T => (local ? local.value : stored),
		/** Whether the field is being edited (remote changes wait until it isn't). */
		editing: () => local !== null,
		/** The person starts editing, from the value on screen. */
		focus(stored: T) {
			if (local) return;
			local = { value: stored };
			changed();
		},
		/** A keystroke: shown at once, saved after a pause. */
		change(value: T) {
			local = { value };
			unsaved = true;
			stopTimer();
			timer = timers.set(flush, delayMs);
			changed();
		},
		/** Saves what's typed now, if anything is unsaved. */
		flush,
		/** The person leaves the field: save, then show the task as stored again. */
		blur() {
			flush();
			local = null;
			changed();
		},
		subscribe(listener: () => void) {
			listeners.add(listener);
			return () => void listeners.delete(listener);
		},
		/** Changes on every change, for `useSyncExternalStore`. */
		version: () => version,
	};
}
