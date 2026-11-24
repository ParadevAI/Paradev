import { describe, expect, test } from "bun:test";
import { parseSwitcherQuery } from "./parseSwitcherQuery";

const CREATORS = ["Harshith Rao", "Avi Peltz", null];

describe("parseSwitcherQuery", () => {
	test("plain text stays on the sidebar", () => {
		expect(parseSwitcherQuery("  relay ", CREATORS)).toEqual({
			scope: "sidebar",
			creator: null,
			text: "relay",
		});
	});

	test("# alone widens to every workspace", () => {
		expect(parseSwitcherQuery("#", CREATORS)).toEqual({
			scope: "all",
			creator: null,
			text: "",
		});
	});

	test("#name picks a creator by word prefix, the rest is search text", () => {
		expect(parseSwitcherQuery("#harsh relay", CREATORS)).toEqual({
			scope: "all",
			creator: "harsh",
			text: "relay",
		});
		expect(parseSwitcherQuery("#Rao", CREATORS)).toMatchObject({
			creator: "rao",
			text: "",
		});
	});

	test("a word after # that names nobody is search text", () => {
		expect(parseSwitcherQuery("#relay tunnel", CREATORS)).toEqual({
			scope: "all",
			creator: null,
			text: "relay tunnel",
		});
	});
});
