import { describe, expect, test } from "bun:test";
import { createSandboxAccess, type SandboxGrant } from "./access";

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((r) => {
		resolve = r;
	});
	return { promise, resolve };
}

const grant = (url: string, token = `t-${url}`): SandboxGrant => ({
	url,
	token,
	expiresAt: Date.now() + 3_600_000,
});

describe("createSandboxAccess", () => {
	test("concurrent wakes share one request", async () => {
		const calls: boolean[] = [];
		const pending = deferred<SandboxGrant>();
		const access = createSandboxAccess((_, wake) => {
			calls.push(wake);
			return pending.promise;
		});
		const first = access.wake("ws");
		const second = access.wake("ws");
		pending.resolve(grant("https://a"));
		expect(await first).toBe(await second);
		expect(calls).toEqual([true]);
		expect(access.tokenFor("https://a")).toBe("t-https://a");
	});

	test("an address read before a wake landed does not replace the woken grant", async () => {
		const address = deferred<SandboxGrant>();
		const access = createSandboxAccess((_, wake) =>
			wake ? Promise.resolve(grant("https://new")) : address.promise,
		);
		const addressed = access.address("ws");
		await access.wake("ws");
		address.resolve(grant("https://old"));
		expect((await addressed).url).toBe("https://new");
		expect(access.get("ws")?.url).toBe("https://new");
		expect(access.tokenFor("https://old")).toBeNull();
	});

	test("registers only the grants it keeps", async () => {
		const address = deferred<SandboxGrant>();
		const registered: string[] = [];
		const access = createSandboxAccess(
			(_, wake) =>
				wake ? Promise.resolve(grant("https://new")) : address.promise,
			{ onGrant: (kept) => void registered.push(kept.url) },
		);
		const addressed = access.address("ws");
		await access.wake("ws");
		address.resolve(grant("https://old"));
		await addressed;
		expect(registered).toEqual(["https://new"]);
	});

	test("a workspace cleared mid-mint keeps no ticket", async () => {
		const pending = deferred<SandboxGrant>();
		const access = createSandboxAccess(() => pending.promise);
		const minted = access.wake("ws");
		access.clear("ws");
		pending.resolve(grant("https://a"));
		await minted;
		expect(access.get("ws")).toBeNull();
		expect(access.tokenFor("https://a")).toBeNull();
	});

	test("refresh drops a request already in flight", async () => {
		const before = deferred<SandboxGrant>();
		const requested: string[] = [];
		const access = createSandboxAccess(() => {
			requested.push("address");
			return requested.length === 1
				? before.promise
				: Promise.resolve(grant("https://after"));
		});
		const stale = access.address("ws");
		access.refresh("ws");
		const fresh = await access.address("ws");
		before.resolve(grant("https://before"));
		await stale;
		expect(fresh.url).toBe("https://after");
		expect(requested).toEqual(["address", "address"]);
		expect(access.get("ws")?.url).toBe("https://after");
	});

	test("ensure reuses a fresh grant and prune drops unlisted workspaces", async () => {
		let requests = 0;
		const access = createSandboxAccess((id) => {
			requests++;
			return Promise.resolve(grant(`https://${id}`));
		});
		await access.ensure("a");
		await access.ensure("a");
		await access.ensure("b");
		expect(requests).toBe(2);
		access.prune(new Set(["b"]));
		expect(access.get("a")).toBeNull();
		expect(access.get("b")).not.toBeNull();
	});
});
