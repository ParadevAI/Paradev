import { describe, expect, mock, test } from "bun:test";
import {
	requestActionSheet,
	settleActionSheet,
	subscribeActionSheet,
} from "./actionSheetRequest";

const options = { options: ["Edit", "Delete", "Cancel"], cancelButtonIndex: 2 };

describe("actionSheetRequest", () => {
	test("without a mounted host nothing opens", () => {
		expect(requestActionSheet({ options, onSelect: () => {} })).toBe(false);
	});

	test("a choice reports its index once, and a dismissal reports cancel", () => {
		const unmount = subscribeActionSheet(() => {});
		const first = mock((_index: number) => {});
		expect(requestActionSheet({ options, onSelect: first })).toBe(true);
		settleActionSheet(1);
		settleActionSheet(0);
		expect(first.mock.calls).toEqual([[1]]);

		const second = mock((_index: number) => {});
		requestActionSheet({ options, onSelect: second });
		settleActionSheet();
		expect(second.mock.calls).toEqual([[2]]);
		unmount();
	});

	test("a new sheet cancels the one still open", () => {
		const unmount = subscribeActionSheet(() => {});
		const first = mock((_index: number) => {});
		requestActionSheet({ options, onSelect: first });
		requestActionSheet({ options, onSelect: () => {} });
		expect(first.mock.calls).toEqual([[2]]);
		settleActionSheet();
		unmount();
	});
});
