import { afterAll, describe, expect, test } from "bun:test";
import { createSandboxAccess, type SandboxGrant } from "./access";
import { callWithWake, probeSandboxHost } from "./reach";

const statusByToken: Record<string, number> = {
	serving: 200,
	stopped: 410,
	failing: 502,
};
const server = Bun.serve({
	port: 0,
	fetch(request) {
		const token = request.headers.get("authorization")?.replace("Bearer ", "");
		const url = new URL(request.url);
		if (url.pathname !== "/trpc/health.check") {
			return new Response(null, { status: 404 });
		}
		return new Response(null, { status: statusByToken[token ?? ""] ?? 401 });
	},
});
afterAll(() => server.stop(true));

describe("probeSandboxHost", () => {
	test("tells a stopped box from a serving or failing one", async () => {
		const url = `http://localhost:${server.port}/`;
		expect(await probeSandboxHost(url, "serving")).toBe("serving");
		expect(await probeSandboxHost(url, "stopped")).toBe("stopped");
		expect(await probeSandboxHost(url, "failing")).toBe("unreachable");
		expect(await probeSandboxHost("http://localhost:1", "serving", 500)).toBe(
			"unreachable",
		);
	});
});

describe("callWithWake", () => {
	const grant = (url: string): SandboxGrant => ({
		url,
		token: url,
		expiresAt: Date.now() + 3_600_000,
	});
	const unanswered = new Error("no answer");
	const isUnanswered = (error: unknown) => error === unanswered;

	function setup(answersAt: string | null) {
		const requests: string[] = [];
		const calls: string[] = [];
		const access = createSandboxAccess((_, wake) => {
			requests.push(wake ? "wake" : "address");
			return Promise.resolve(grant(wake ? "woken" : "addressed"));
		});
		const call = async (used: SandboxGrant) => {
			calls.push(used.url);
			if (used.url !== answersAt) throw unanswered;
			return used.url;
		};
		return { access, call, requests, calls };
	}

	test("uses a cached grant that answers, without asking the API", async () => {
		const { access, call, requests } = setup("cached");
		const result = await callWithWake({
			access,
			workspaceId: "ws",
			call,
			cached: grant("cached"),
			isUnanswered,
		});
		expect(result).toBe("cached");
		expect(requests).toEqual([]);
	});

	test("tries a fresh address, then wakes, only while nothing answers", async () => {
		const { access, call, requests, calls } = setup("woken");
		const result = await callWithWake({
			access,
			workspaceId: "ws",
			call,
			cached: grant("cached"),
			isUnanswered,
		});
		expect(result).toBe("woken");
		expect(calls).toEqual(["cached", "addressed", "woken"]);
		expect(requests).toEqual(["address", "wake"]);
	});

	test("never repeats a call the box answered", async () => {
		const { access, requests } = setup(null);
		const answered = new Error("host said no");
		let calls = 0;
		await expect(
			callWithWake({
				access,
				workspaceId: "ws",
				call: async () => {
					calls++;
					throw answered;
				},
				isUnanswered,
			}),
		).rejects.toBe(answered);
		expect(calls).toBe(1);
		expect(requests).toEqual(["address"]);
	});
});
