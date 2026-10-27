import { describe, expect, test } from "bun:test";
import { isLocalProxy } from "./local-proxy";

describe("isLocalProxy", () => {
	test("accepts the local proxy URL", () => {
		expect(
			isLocalProxy("postgres://postgres:postgres@db.localtest.me:3010/main"),
		).toBe(true);
	});

	test("rejects a remote or invalid URL", () => {
		expect(isLocalProxy("postgres://u:p@ep-x.neon.tech/main")).toBe(false);
		expect(isLocalProxy("not a url")).toBe(false);
	});

	test("rejects a local hostname that the driver does not connect to", () => {
		expect(
			isLocalProxy(
				"postgres://u:p@db.localtest.me:3010/main?host=remote.example",
			),
		).toBe(false);
		expect(
			isLocalProxy("postgres://remote.example\\@db.localtest.me:3010/main"),
		).toBe(false);
		expect(isLocalProxy("socket://db.localtest.me/tmp/sock")).toBe(false);
	});
});
