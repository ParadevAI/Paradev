/** What an app tells the API about itself, so phones aren't pushed what the person is already seeing (see `PUT /presence`). */
export interface Presence {
	/** The person is using this app now: the Mac's window focused with recent input, the phone's app in the foreground. */
	active: boolean;
	/** The chat whose conversation is on screen, if any. */
	groupId: string | null;
}

/** How often an active app says so again; the API forgets a report after 75 s. */
const HEARTBEAT_MS = 30_000;
/** Moving between chats in quick succession sends only where the person lands. */
const SETTLE_MS = 300;

interface Timers {
	set: (run: () => void, ms: number) => unknown;
	clear: (handle: unknown) => void;
}

const TIMERS: Timers = {
	set: (run, ms) => setTimeout(run, ms),
	clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

const same = (a: Presence | null, b: Presence) =>
	a?.active === b.active && a.groupId === b.groupId;

/**
 * Reports an app's presence: a change after a short pause, going inactive at once (the app may be suspended next), and
 * every 30 s while active. A failed report is dropped; the next beat repeats it, and the API's expiry covers an app
 * that stops reporting at all.
 */
export function createPresenceReporter({
	send,
	timers = TIMERS,
}: {
	send: (presence: Presence) => Promise<unknown>;
	timers?: Timers;
}) {
	let wanted: Presence | null = null;
	let sent: Presence | null = null;
	let timer: unknown = null;
	let stopped = false;

	const clear = () => {
		if (timer !== null) timers.clear(timer);
		timer = null;
	};
	const schedule = (run: () => void, ms: number) => {
		clear();
		timer = timers.set(() => {
			timer = null;
			run();
		}, ms);
	};
	const report = () => {
		if (!wanted || stopped) return;
		sent = wanted;
		send(wanted).catch(() => {});
		if (wanted.active) schedule(report, HEARTBEAT_MS);
		else clear();
	};

	return {
		/** Where the app is now; repeating the same presence changes nothing. */
		set(presence: Presence) {
			if (stopped || same(wanted, presence)) return;
			wanted = presence;
			// Back to what the API already has before a change was sent: only the heartbeat, if any, is left to do.
			if (same(sent, presence))
				return presence.active ? schedule(report, HEARTBEAT_MS) : clear();
			if (presence.active) schedule(report, SETTLE_MS);
			else report();
		},
		/** The app is going away (signing out, closing): says it's inactive, if it last said otherwise, and stops. */
		stop() {
			if (stopped) return;
			clear();
			stopped = true;
			if (sent?.active) send({ active: false, groupId: null }).catch(() => {});
		},
	};
}
