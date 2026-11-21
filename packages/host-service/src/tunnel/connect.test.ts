import { expect, mock, test } from "bun:test";
import type { ApiClient } from "../types";
import { registerHost } from "./connect";

test("a stalled host.ensure is cancelled at its deadline", async () => {
	const shutdown = new AbortController();
	const mutate = mock(
		(_input: unknown, { signal }: { signal: AbortSignal }) =>
			new Promise((_resolve, reject) => {
				signal.addEventListener("abort", () => {
					// Stops before the retry so health.check's shared state stays unset.
					shutdown.abort();
					reject(signal.reason);
				});
			}),
	);
	const api = { host: { ensure: { mutate } } } as unknown as ApiClient;

	const host = await registerHost(
		{ api, organizationId: "org", signal: shutdown.signal },
		5,
	);

	expect(host).toBeNull();
	expect(mutate).toHaveBeenCalledTimes(1);
	expect(mutate.mock.calls[0]?.[1].signal.reason).toMatchObject({
		name: "TimeoutError",
	});
});
