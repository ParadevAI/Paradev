import { describe, expect, test } from "bun:test";
import { askOnce } from "./askOnce";

function deps({ allowedAfterAsk }: { allowedAfterAsk: boolean }) {
	let allowed = false;
	let asked = false;
	let prompts = 0;
	return {
		get prompts() {
			return prompts;
		},
		isAllowed: () => allowed,
		wasAsked: async () => asked,
		markAsked: async () => {
			asked = true;
		},
		ask: async () => {
			prompts += 1;
			allowed = allowedAfterAsk;
		},
	};
}

describe("askOnce", () => {
	test("prompts the first time and reports the answer", async () => {
		const granted = deps({ allowedAfterAsk: true });
		expect(await askOnce(granted)).toBe(true);
		expect(granted.prompts).toBe(1);
	});

	test("never prompts again after a denial", async () => {
		const denied = deps({ allowedAfterAsk: false });
		expect(await askOnce(denied)).toBe(false);
		expect(await askOnce(denied)).toBe(false);
		expect(denied.prompts).toBe(1);
	});

	test("does not prompt when already allowed", async () => {
		const prompts: string[] = [];
		const allowed = await askOnce({
			isAllowed: () => true,
			wasAsked: async () => false,
			markAsked: async () => {},
			ask: async () => prompts.push("asked"),
		});
		expect(allowed).toBe(true);
		expect(prompts).toEqual([]);
	});

	test("a failing prompt counts as not allowed", async () => {
		const allowed = await askOnce({
			isAllowed: () => false,
			wasAsked: async () => false,
			markAsked: async () => {},
			ask: async () => {
				throw new Error("no activity");
			},
		});
		expect(allowed).toBe(false);
	});
});
