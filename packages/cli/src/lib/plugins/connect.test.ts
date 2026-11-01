import { describe, expect, test } from "bun:test";
import { findConnectTarget } from "./connect";

const entry = (name: string, marketplace: string, installed: boolean) => ({
	name,
	marketplace,
	installed,
	connector: `${name}_mcp`,
});

const ledgerEntry = (name: string, marketplace: string) => ({
	name,
	marketplace,
	version: "1.0.0",
	installedAt: "then",
	enabled: true,
});

describe("findConnectTarget", () => {
	test("a plugin installed on the account needs no entry in this machine's ledger", () => {
		const catalog = [entry("autumn", "superset", true)];
		for (const marketplace of [undefined, "superset"]) {
			expect(findConnectTarget(catalog, [], "autumn", marketplace)).toEqual({
				marketplace: "superset",
				connector: "autumn_mcp",
			});
		}
	});

	test("a plugin only in this machine's ledger still resolves its connector", () => {
		expect(
			findConnectTarget(
				[entry("autumn", "superset", false)],
				[ledgerEntry("autumn", "superset")],
				"autumn",
			),
		).toEqual({ marketplace: "superset", connector: "autumn_mcp" });
	});

	test("a plugin installed nowhere is not a target", () => {
		expect(
			findConnectTarget([entry("autumn", "superset", false)], [], "autumn"),
		).toBeUndefined();
	});

	test("an install in two marketplaces must be named", () => {
		expect(() =>
			findConnectTarget(
				[entry("deploy", "superset", true), entry("deploy", "acme", true)],
				[],
				"deploy",
			),
		).toThrow('"deploy" is installed from superset, acme.');
	});

	test("a local install from a marketplace the account does not list must be named", () => {
		expect(() =>
			findConnectTarget(
				[entry("deploy", "superset", true)],
				[ledgerEntry("deploy", "acme")],
				"deploy",
			),
		).toThrow('"deploy" is installed from superset, acme.');
	});
});
