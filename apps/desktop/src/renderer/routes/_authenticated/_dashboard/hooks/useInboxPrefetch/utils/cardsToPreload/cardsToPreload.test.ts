import { describe, expect, test } from "bun:test";
import { cardsToPreload, PRELOAD_AHEAD } from "./cardsToPreload";

const order = Array.from({ length: 20 }, (_, index) => `c${index}`);

describe("which cards load before they are asked for", () => {
	test("moving down: the next five below, nearest first, and the one just passed", () => {
		expect(cardsToPreload(order, 6, 1)).toEqual([
			"c7",
			"c5",
			"c8",
			"c9",
			"c10",
			"c11",
		]);
	});

	test("moving up: the five above, and the one below", () => {
		expect(cardsToPreload(order, 6, -1)).toEqual([
			"c5",
			"c7",
			"c4",
			"c3",
			"c2",
			"c1",
		]);
	});

	test("nothing selected: the first few of the list", () => {
		expect(cardsToPreload(order, -1, 1)).toEqual(order.slice(0, PRELOAD_AHEAD));
	});

	test("the ends of the list add nothing past them", () => {
		expect(cardsToPreload(order, 19, 1)).toEqual(["c18"]);
		expect(cardsToPreload(order, 0, -1)).toEqual(["c1"]);
	});
});
