import { afterEach, describe, expect, test } from "bun:test";
import { deadlineFetch, TransportError } from "./transport-fetch";

const realFetch = globalThis.fetch;

/** A server that accepts the request and never answers. */
function neverAnswers(): typeof fetch {
	return ((_input: RequestInfo | URL, init?: RequestInit) =>
		new Promise<Response>((_resolve, reject) => {
			init?.signal?.addEventListener("abort", () =>
				reject(new DOMException("Aborted", "AbortError")),
			);
		})) as typeof fetch;
}

afterEach(() => {
	globalThis.fetch = realFetch;
});

describe("deadlineFetch", () => {
	test("fails as a transport error when no response arrives in time", async () => {
		globalThis.fetch = neverAnswers();
		const outcome = await Promise.race([
			deadlineFetch(20)("http://host.test/trpc/x").catch(
				(caught: unknown) => caught,
			),
			new Promise((resolve) => setTimeout(() => resolve("pending"), 500)),
		]);
		expect(outcome).toBeInstanceOf(TransportError);
	});

	test("returns the response that arrives in time", async () => {
		globalThis.fetch = (async () => new Response("ok")) as typeof fetch;
		const response = await deadlineFetch(1_000)("http://host.test/trpc/x");
		expect(await response.text()).toBe("ok");
	});

	test("a caller's abort stays an abort, not a transport error", async () => {
		globalThis.fetch = neverAnswers();
		const controller = new AbortController();
		const request = deadlineFetch(1_000)("http://host.test/trpc/x", {
			signal: controller.signal,
		});
		controller.abort();
		const error = await request.catch((caught: unknown) => caught);
		expect(error).not.toBeInstanceOf(TransportError);
		expect((error as Error).name).toBe("AbortError");
	});
});
