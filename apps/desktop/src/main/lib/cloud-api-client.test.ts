import { afterAll, describe, expect, test } from "bun:test";
import { fetchWithDeadline } from "./cloud-api-client";

const server = Bun.serve({
	port: 0,
	fetch(req) {
		if (new URL(req.url).pathname === "/stall") return new Promise(() => {});
		return new Response("<html>\n<h1>Bad gateway</h1>\n</html>", {
			status: 502,
			statusText: "Bad Gateway",
			headers: { "content-type": "text/html" },
		});
	},
});

afterAll(() => server.stop(true));

describe("fetchWithDeadline", () => {
	test("aborts a request that stalls past the deadline", async () => {
		const error = await fetchWithDeadline(`${server.url}stall`, {}, 20).catch(
			(caught: Error) => caught,
		);
		expect(error).toBeInstanceOf(Error);
		expect((error as Error).name).toBe("TimeoutError");
	});

	test("names the status of a non-JSON error page", async () => {
		await expect(fetchWithDeadline(`${server.url}gateway`)).rejects.toThrow(
			"HTTP 502 Bad Gateway: <html> / <h1>Bad gateway</h1> / </html>",
		);
	});
});
