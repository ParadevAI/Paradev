import { rawErrorMessage } from "@superset/i18n/errors";

/**
 * A request that never got a server response.
 *
 * tRPC reports this itself — a `TRPCClientError` with no `data` — so its
 * clients need nothing here. better-auth's fetch rejects with whatever the
 * platform threw, which on iOS is Expo's opaque `UnexpectedException`, so its
 * failures are wrapped instead. The `catch` is around our own `fetch` call,
 * which makes the classification structural: transport by construction, not
 * by inspecting a message.
 */
export class TransportError extends Error {
	constructor(cause: unknown) {
		// Carry the platform's text for logs and Sentry grouping. It is never
		// displayed — `errorCopy()` answers from the kind instead.
		super(rawErrorMessage(cause) || "transport failure");
		this.name = "TransportError";
		this.cause = cause;
	}
}

/** `fetch`, with every rejection normalized to a `TransportError`. */
export const transportFetch: typeof fetch = async (input, init) => {
	try {
		return await fetch(input, init);
	} catch (cause) {
		throw new TransportError(cause);
	}
};

/**
 * `fetch` that gives up when no response arrives within `ms`. React Native's
 * Android client is built with no timeouts (OkHttpClientProvider sets them to
 * 0), so a request the far side accepts and never answers stays pending for
 * good there; iOS's URLSession gives up after 60 s.
 */
export function deadlineFetch(ms: number): typeof fetch {
	return (input, init) => {
		const callerSignal = init?.signal ?? undefined;
		const controller = new AbortController();
		let timedOut = false;
		const onCallerAbort = () => controller.abort(callerSignal?.reason);
		const timer = setTimeout(() => {
			timedOut = true;
			controller.abort();
		}, ms);
		if (callerSignal?.aborted) onCallerAbort();
		else callerSignal?.addEventListener("abort", onCallerAbort, { once: true });
		return fetch(input, { ...init, signal: controller.signal })
			.catch((cause: unknown) => {
				throw timedOut
					? new TransportError(new Error(`no response in ${ms} ms`))
					: cause;
			})
			.finally(() => {
				clearTimeout(timer);
				callerSignal?.removeEventListener("abort", onCallerAbort);
			});
	};
}
