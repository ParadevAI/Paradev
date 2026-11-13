import { Database } from "bun:sqlite";
import { beforeEach, describe, expect, test } from "bun:test";
import type { SqlLike } from "@superset/shared/page-storage-records";
import {
	ACCESS_TTL_MS,
	type AccessAnswer,
	MAX_ACCESS_ASK,
	PageAccessCache,
	parseAccessAnswer,
} from "./pageAccess";

function sqlite(db: Database): SqlLike {
	return {
		exec: (query, ...bindings) => {
			const rows = db.query(query).all(...(bindings as never[])) as never[];
			return { toArray: () => rows };
		},
	};
}

const reader = { read: true, write: true, author: false };
const refused = { read: false, write: false, author: false };

let now: number;
let asked: string[][];
let answer: (userIds: string[]) => AccessAnswer | null;
let cache: PageAccessCache;

beforeEach(() => {
	now = 1_000_000;
	asked = [];
	answer = (userIds) => ({
		guests: false,
		users: Object.fromEntries(userIds.map((id) => [id, reader])),
	});
	cache = new PageAccessCache(
		sqlite(new Database(":memory:")),
		async (userIds) => {
			asked.push(userIds);
			return answer(userIds);
		},
		() => now,
	);
	cache.ensureSchema();
});

describe("PageAccessCache", () => {
	test("asks once for the people it has not seen, then answers from the cache", async () => {
		expect((await cache.check(["ana"])).users.get("ana")).toEqual(reader);
		expect((await cache.check(["ana", "ben"])).users.get("ben")).toEqual(
			reader,
		);
		await cache.check(["ana", "ben"]);
		expect(asked).toEqual([["ana"], ["ben"]]);
	});

	test("asks again once an answer is older than the TTL", async () => {
		await cache.check(["ana"]);
		now += ACCESS_TTL_MS + 1;
		await cache.check(["ana"]);
		expect(asked).toEqual([["ana"], ["ana"]]);
	});

	test("caches a refusal like any other answer", async () => {
		answer = (userIds) => ({
			guests: false,
			users: Object.fromEntries(userIds.map((id) => [id, refused])),
		});
		expect((await cache.check(["eve"])).users.get("eve")).toEqual(refused);
		await cache.check(["eve"]);
		expect(asked).toEqual([["eve"]]);
	});

	test("keeps the guest flag in the cache too", async () => {
		answer = () => ({ guests: true, users: {} });
		expect((await cache.check([])).guests).toBe(true);
		expect((await cache.check([])).guests).toBe(true);
		expect(asked).toEqual([[]]);
	});

	test("clear forgets every answer", async () => {
		await cache.check(["ana"]);
		cache.clear();
		await cache.check(["ana"]);
		expect(asked).toEqual([["ana"], ["ana"]]);
	});

	test("refuses everyone when the page is gone", async () => {
		answer = () => null;
		const result = await cache.check(["ana"]);
		expect(result.guests).toBe(false);
		expect(result.users.get("ana")).toEqual(refused);
	});

	test("caches nothing when the API fails, so the next check asks again", async () => {
		answer = () => {
			throw new Error("down");
		};
		await expect(cache.check(["ana"])).rejects.toThrow("down");
		answer = (userIds) => ({
			guests: false,
			users: Object.fromEntries(userIds.map((id) => [id, reader])),
		});
		expect((await cache.check(["ana"])).users.get("ana")).toEqual(reader);
		expect(asked).toEqual([["ana"], ["ana"]]);
	});

	test("treats a person the API left out as refused", async () => {
		answer = () => ({ guests: false, users: {} });
		expect((await cache.check(["ana"])).users.get("ana")).toEqual(refused);
	});
});

describe("parseAccessAnswer", () => {
	test("accepts the API's shape", () => {
		expect(parseAccessAnswer({ guests: true, users: { ana: reader } })).toEqual(
			{ guests: true, users: { ana: reader } },
		);
	});

	test("rejects anything else", () => {
		for (const value of [
			null,
			"x",
			{ users: {} },
			{ guests: "yes", users: {} },
			{ guests: false, users: { ana: { read: "true" } } },
		]) {
			expect(parseAccessAnswer(value)).toBeNull();
		}
	});
});

test("asks in chunks the API accepts", async () => {
	const many = Array.from({ length: MAX_ACCESS_ASK + 1 }, (_, i) => `u${i}`);
	const result = await cache.check(many);
	expect(asked.map((chunk) => chunk.length)).toEqual([MAX_ACCESS_ASK, 1]);
	expect(result.users.get(`u${MAX_ACCESS_ASK}`)).toEqual(reader);
});
