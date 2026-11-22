import { describe, expect, test } from "bun:test";
import { apiKey } from "@better-auth/api-key";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { nullOnRejectedApiKey } from "./rejected-api-key";

async function setup() {
	const auth = betterAuth({
		secret: "test-secret-at-least-32-characters-long",
		baseURL: "http://localhost:3000",
		database: memoryAdapter({
			user: [],
			session: [],
			account: [],
			verification: [],
			apikey: [],
		}),
		emailAndPassword: { enabled: true },
		plugins: [
			apiKey({
				enableSessionForAPIKeys: true,
				defaultPrefix: "sk_live_",
				rateLimit: { enabled: false },
			}),
		],
	});
	const { user } = await auth.api.signUpEmail({
		body: { email: "a@example.com", password: "password1234", name: "A" },
	});
	const createKey = async (body: Record<string, unknown> = {}) =>
		(
			await auth.api.createApiKey({
				body: { userId: user.id, name: "test", ...body },
			})
		).key;
	const lookup = (key?: string) =>
		nullOnRejectedApiKey(
			auth.api.getSession({
				headers: new Headers(key ? { "x-api-key": key } : {}),
			}),
		);
	return { auth, user, createKey, lookup };
}

describe("nullOnRejectedApiKey", () => {
	test("an unknown key resolves to no session", async () => {
		const { lookup } = await setup();
		expect(await lookup(`sk_live_${"x".repeat(64)}`)).toBeNull();
	});

	test("a malformed (too short) key resolves to no session", async () => {
		const { lookup } = await setup();
		expect(await lookup("sk_live_bad")).toBeNull();
	});

	test("a disabled key resolves to no session", async () => {
		const { auth, createKey, lookup, user } = await setup();
		const key = await createKey();
		const [stored] = (
			await auth.api.listApiKeys({
				headers: new Headers({ "x-api-key": key }),
			})
		).apiKeys;
		await auth.api.updateApiKey({
			body: { keyId: stored?.id ?? "", userId: user.id, enabled: false },
		});
		expect(await lookup(key)).toBeNull();
	});

	test("an expired key resolves to no session", async () => {
		const { createKey, lookup } = await setup();
		const key = await createKey({ expiresIn: 60 * 60 * 24 });
		const realNow = Date.now;
		Date.now = () => realNow() + 2 * 60 * 60 * 24 * 1000;
		try {
			expect(await lookup(key)).toBeNull();
		} finally {
			Date.now = realNow;
		}
	});

	test("a valid key still resolves to its user", async () => {
		const { createKey, lookup, user } = await setup();
		const session = await lookup(await createKey());
		expect(session?.user.id).toBe(user.id);
	});

	test("no credentials resolve to no session", async () => {
		const { lookup } = await setup();
		expect(await lookup()).toBeNull();
	});

	test("a key out of uses keeps its 429", async () => {
		const { createKey, lookup } = await setup();
		const key = await createKey({ remaining: 0 });
		await expect(lookup(key)).rejects.toMatchObject({ statusCode: 429 });
	});

	test("an error that is not about the key is rethrown", async () => {
		const failure = new Error("database is down");
		await expect(nullOnRejectedApiKey(Promise.reject(failure))).rejects.toBe(
			failure,
		);
	});
});
