import { expect, mock, test } from "bun:test";
import type { SessionConfigOption } from "@superset/chat/protocol";
import { renderHook } from "@testing-library/react";
import { useCodexPickerOptions } from "./useCodexPickerOptions";

function modelOptions(currentValue: string): SessionConfigOption[] {
	return [
		{
			id: "model",
			label: "Model",
			category: "model",
			currentValue,
			options: [
				{ id: "alpha", label: "Alpha" },
				{ id: "beta", label: "Beta" },
			],
		},
	];
}

test("reconciles repeated deselection cycles after the previous change is acknowledged", () => {
	const onSelect = mock(async (_configId: string, _value: string) => {});
	const onError = mock((_error: unknown) => {});
	const hook = renderHook(
		({ currentValue }) =>
			useCodexPickerOptions({
				enabled: true,
				blocked: false,
				configOptions: modelOptions(currentValue),
				selectedIds: ["beta"],
				onSelect,
				onError,
			}),
		{ initialProps: { currentValue: "alpha" } },
	);
	expect(hook.result.current[0]?.options.map((option) => option.id)).toEqual([
		"beta",
	]);
	expect(onSelect.mock.calls).toEqual([["model", "beta"]]);
	hook.rerender({ currentValue: "alpha" });
	expect(onSelect).toHaveBeenCalledTimes(1);
	hook.rerender({ currentValue: "beta" });
	hook.rerender({ currentValue: "alpha" });
	expect(onSelect.mock.calls).toEqual([
		["model", "beta"],
		["model", "beta"],
	]);
});

test("defers model changes while a turn is busy and leaves other agents untouched", () => {
	const onSelect = mock(async (_configId: string, _value: string) => {});
	const onError = mock((_error: unknown) => {});
	const hook = renderHook(
		({ enabled, blocked }) =>
			useCodexPickerOptions({
				enabled,
				blocked,
				configOptions: modelOptions("alpha"),
				selectedIds: ["beta"],
				onSelect,
				onError,
			}),
		{ initialProps: { enabled: false, blocked: false } },
	);
	expect(hook.result.current[0]?.options).toHaveLength(2);
	expect(onSelect).not.toHaveBeenCalled();
	hook.rerender({ enabled: true, blocked: true });
	expect(onSelect).not.toHaveBeenCalled();
	hook.rerender({ enabled: true, blocked: false });
	expect(onSelect.mock.calls).toEqual([["model", "beta"]]);
});
