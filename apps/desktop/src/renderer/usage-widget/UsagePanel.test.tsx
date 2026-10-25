import { afterEach, expect, mock, test } from "bun:test";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import {
	readWidgetPreferences,
	type WidgetSnapshot,
} from "shared/usage-widget/model";
import { UsagePanel } from "./UsagePanel";

afterEach(cleanup);

test("color editing reserves panel space and save restores measured content height", async () => {
	const previous = window.UsageWidget;
	const resize = mock((_height: number) => {});
	const setAppearance = mock(
		(
			_id: string,
			_appearance: { color: string | null; label?: string | null },
		) => Promise.resolve(),
	);
	const state: WidgetSnapshot = {
		preferences: readWidgetPreferences({}),
		accounts: [
			{
				id: "studio",
				provider: "claude",
				label: "Studio",
				email: null,
				plan: null,
				isDefault: true,
				status: "ok",
				identityChanged: false,
				billing: "subscription",
				windows: [],
				checkedAt: null,
				historical: false,
			},
		],
		hosts: [],
		hostId: "fixture",
		displays: [],
		loading: false,
		offline: false,
		locale: "en",
		dark: true,
		expanded: true,
		panelHeight: 339,
		edgeTransition: null,
		provider: null,
		surface: "menu",
	};
	window.UsageWidget = {
		snapshot: async () => state,
		resize,
		setAppearance,
		setHidden: async () => {},
		settled: () => {},
		hover: () => {},
		action: async () => {},
		subscribe: () => () => {},
	};
	try {
		const view = render(<UsagePanel initial={state} />);
		const content = view.container.querySelector<HTMLElement>(
			".usage-scroll > div",
		);
		if (!content) throw new Error("Missing usage content");
		content.getBoundingClientRect = () => new DOMRect(0, 0, 300, 180);
		resize.mockClear();
		await act(async () => {
			fireEvent.click(
				view.getByRole("button", { name: "Account color · Studio" }),
			);
		});
		expect(resize.mock.calls.at(-1)).toEqual([548]);
		fireEvent.change(view.getByLabelText("Hex color"), {
			target: { value: "#17bbcc" },
		});
		await act(async () => {
			fireEvent.click(view.getByRole("button", { name: "Save" }));
		});
		expect(setAppearance).toHaveBeenCalledWith("studio", { color: "#17bbcc" });
		expect(resize.mock.calls.at(-1)).toEqual([182]);
		expect(view.queryByLabelText("Hex color")).toBeNull();
	} finally {
		cleanup();
		window.UsageWidget = previous;
	}
});
