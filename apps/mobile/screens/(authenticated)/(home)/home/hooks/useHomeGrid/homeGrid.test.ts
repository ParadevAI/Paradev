import { describe, expect, test } from "bun:test";
import { homeGrid } from "./homeGrid";

const noInsets = { left: 0, right: 0 };
const duoColumn = { left: 0, right: 84 };

describe("homeGrid", () => {
	test("phones and the folded iPhone Duo keep the list", () => {
		expect(homeGrid({ width: 402 }, noInsets)).toBeNull();
		expect(homeGrid({ width: 466 }, duoColumn)).toBeNull();
	});

	test("the open iPhone Duo gets two columns inside its button column", () => {
		const grid = homeGrid({ width: 951 }, duoColumn);
		expect(grid?.columns).toBe(2);
		expect(grid?.inset).toBe(20);
	});

	test("iPad landscape gets three columns, never more", () => {
		expect(homeGrid({ width: 1194 }, noInsets)?.columns).toBe(3);
		expect(homeGrid({ width: 2000 }, noInsets)?.columns).toBe(3);
	});
});
