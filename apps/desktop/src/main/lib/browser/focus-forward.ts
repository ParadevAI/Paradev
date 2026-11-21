/**
 * Runs in an isolated world: a page that replaces `window.Promise` (Zone.js in
 * Angular apps) would otherwise hand `executeJavaScript` a non-native promise,
 * which it returns at once instead of awaiting. Resolves `true` on the next
 * trusted `mousedown` in the guest's current document, `false` on `pagehide`.
 * A pending `executeJavaScript` keeps its document alive, so `pagehide` must
 * settle it.
 */
export const NEXT_MOUSEDOWN_SCRIPT = `(() => {
	if (!window.__supersetMousedownHook) {
		window.__supersetMousedownHook = { resolvers: [] };
		const settle = (pressed) => {
			const hook = window.__supersetMousedownHook;
			const resolvers = hook.resolvers;
			hook.resolvers = [];
			for (const resolve of resolvers) resolve(pressed);
		};
		document.addEventListener("mousedown", (event) => {
			if (event.isTrusted) settle(true);
		}, true);
		window.addEventListener("pagehide", () => settle(false));
	}
	return new Promise((resolve) => {
		window.__supersetMousedownHook.resolvers.push(resolve);
	});
})()`;

export const FOCUS_FORWARD_WORLD_ID = 1998;

export interface FocusForwardDeps {
	runScript: (script: string) => Promise<unknown>;
	isDestroyed: () => boolean;
	onPress: () => void;
	onUnexpectedResult: (result: unknown) => void;
	sleep: (ms: number) => Promise<void>;
	retryDelayMs?: number;
}

export interface FocusForward {
	/** Starts a loop for a new main-frame document; the previous one exits. */
	rearm: () => void;
	cancel: () => void;
}

export function createFocusForward(deps: FocusForwardDeps): FocusForward {
	const retryDelayMs = deps.retryDelayMs ?? 100;
	let cancelled = false;
	let generation = 0;

	const loop = async (gen: number): Promise<void> => {
		while (!cancelled && gen === generation) {
			if (deps.isDestroyed()) return;
			let pressed: unknown;
			try {
				pressed = await deps.runScript(NEXT_MOUSEDOWN_SCRIPT);
			} catch {
				// Mid-navigation or crashed renderer: retry without a hot spin.
				await deps.sleep(retryDelayMs);
				continue;
			}
			if (cancelled || gen !== generation) return;
			if (pressed === true) {
				deps.onPress();
				continue;
			}
			// Anything but a press resolved at once; looping on it never yields.
			if (pressed !== false) deps.onUnexpectedResult(pressed);
			return;
		}
	};

	return {
		rearm: () => {
			generation += 1;
			void loop(generation);
		},
		cancel: () => {
			cancelled = true;
		},
	};
}
