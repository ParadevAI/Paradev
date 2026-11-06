import { describe, expect, test } from "bun:test";
import type { PaneStatus } from "shared/tabs-types";
import { cardStatuses } from "./cardStatuses";

const status = (value: PaneStatus | undefined) => value;

describe("cardStatuses", () => {
	test("each card shows its own pane's status, idle shows none", () => {
		expect(cardStatuses(["working", "idle", undefined], 5, status)).toEqual([
			"working",
			null,
			null,
		]);
	});

	test("panes past the last card fold onto it, highest priority wins", () => {
		expect(
			cardStatuses(["idle", "working", "review", "permission"], 2, status),
		).toEqual([null, "permission"]);
	});
});
