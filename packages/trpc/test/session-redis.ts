import type { SessionRedis } from "../src/router/plugins/proxy/upstream-sessions";

/** The hash commands the plugin proxy's session store uses, held in memory. */
export function memoryRedis(): {
	redis: SessionRedis;
	hashes: Map<string, Map<string, unknown>>;
	expired: string[];
} {
	const hashes = new Map<string, Map<string, unknown>>();
	const expired: string[] = [];
	const hash = (key: string) => {
		const existing = hashes.get(key);
		if (existing) return existing;
		const created = new Map<string, unknown>();
		hashes.set(key, created);
		return created;
	};
	const redis = {
		hget: async (key: string, field: string) =>
			hashes.get(key)?.get(field) ?? null,
		hsetnx: async (key: string, field: string, value: unknown) => {
			const fields = hash(key);
			if (fields.has(field)) return 0;
			fields.set(field, structuredClone(value));
			return 1;
		},
		hdel: async (key: string, field: string) =>
			hashes.get(key)?.delete(field) ? 1 : 0,
		hgetall: async (key: string) => {
			const fields = hashes.get(key);
			return fields?.size ? Object.fromEntries(fields) : null;
		},
		expire: async (key: string) => {
			expired.push(key);
			return 1;
		},
		del: async (key: string) => (hashes.delete(key) ? 1 : 0),
	};
	return { redis: redis as unknown as SessionRedis, hashes, expired };
}

export function unreachableRedis(): SessionRedis {
	const refuse = async () => {
		throw new Error("connect ECONNREFUSED");
	};
	return {
		hget: refuse,
		hsetnx: refuse,
		hdel: refuse,
		hgetall: refuse,
		expire: refuse,
		del: refuse,
	} as unknown as SessionRedis;
}
