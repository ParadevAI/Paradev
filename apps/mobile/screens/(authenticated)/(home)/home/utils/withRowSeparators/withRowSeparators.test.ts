import { describe, expect, test } from "bun:test";
import type { HomeListItem } from "../../types";
import { withRowSeparators } from "./withRowSeparators";

const cloud = (id: string): HomeListItem => ({
	kind: "cloudRow",
	row: { id } as never,
});
const label = (key: string): HomeListItem => ({
	kind: "sectionLabel",
	key,
	label: key,
});

describe("withRowSeparators", () => {
	test("draws under rows, not under headers or the last row before a label", () => {
		const items = withRowSeparators([
			label("a"),
			cloud("1"),
			cloud("2"),
			label("b"),
			cloud("3"),
		]);
		expect(
			items.map((item) =>
				item.kind === "cloudRow" ? `${item.row.id}:${item.separator}` : "label",
			),
		).toEqual(["label", "1:true", "2:false", "label", "3:false"]);
	});
});
