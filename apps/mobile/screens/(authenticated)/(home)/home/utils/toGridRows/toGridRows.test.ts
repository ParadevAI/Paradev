import { describe, expect, test } from "bun:test";
import { toGridRows } from "./toGridRows";

type Item = { kind: "header" | "row"; id: string };
const header = (id: string): Item => ({ kind: "header", id });
const row = (id: string): Item => ({ kind: "row", id });
const isRow = (item: Item) => item.kind === "row";

describe("toGridRows", () => {
	test("packs rows into grid rows without crossing a header", () => {
		const items = [
			header("a"),
			row("1"),
			row("2"),
			row("3"),
			header("b"),
			row("4"),
		];
		expect(toGridRows(items, 2, isRow)).toEqual([
			header("a"),
			{ kind: "gridRow", cells: [row("1"), row("2")] },
			{ kind: "gridRow", cells: [row("3")] },
			header("b"),
			{ kind: "gridRow", cells: [row("4")] },
		]);
	});

	test("one column leaves the phone list untouched", () => {
		const items = [header("a"), row("1"), row("2")];
		expect(toGridRows(items, 1, isRow)).toBe(items);
	});
});
