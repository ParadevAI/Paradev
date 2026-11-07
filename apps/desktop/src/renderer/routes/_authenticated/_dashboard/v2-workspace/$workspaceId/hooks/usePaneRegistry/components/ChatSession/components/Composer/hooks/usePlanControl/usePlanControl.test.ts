import { afterEach, expect, mock, test } from "bun:test";
import type { SessionConfigOption } from "@superset/chat/protocol";
import { usePlanControl } from "./usePlanControl";

const { cleanup, renderHook } = await import("@testing-library/react");
afterEach(cleanup);

const CLAUDE_MODES = [
	{ id: "default" },
	{ id: "acceptEdits" },
	{ id: "plan" },
	{ id: "bypassPermissions" },
];

test("plan mode leaves for the approval mode it was entered from", () => {
	const onSetMode = mock((_modeId: string) => {});
	const { result, rerender } = renderHook(usePlanControl, {
		initialProps: {
			configOptions: [] as SessionConfigOption[],
			modes: CLAUDE_MODES,
			currentModeId: "acceptEdits" as string | undefined,
			onSetMode,
			onSetConfigOption: undefined,
		},
	});
	expect(result.current?.active).toBe(false);
	result.current?.enter();
	expect(onSetMode).toHaveBeenLastCalledWith("plan");

	rerender({
		configOptions: [],
		modes: CLAUDE_MODES,
		currentModeId: "plan",
		onSetMode,
		onSetConfigOption: undefined,
	});
	expect(result.current?.active).toBe(true);
	expect(result.current?.returnModeId).toBe("acceptEdits");
	result.current?.leave();
	expect(onSetMode).toHaveBeenLastCalledWith("acceptEdits");
});

test("plan as a config option switches the option and keeps the mode", () => {
	const onSetConfigOption = mock((_configId: string, _value: string) => {});
	const { result } = renderHook(() =>
		usePlanControl({
			configOptions: [
				{
					id: "collaboration_mode",
					label: "Collaboration mode",
					currentValue: "default",
					options: [
						{ id: "default", label: "Default" },
						{ id: "plan", label: "Plan" },
					],
				},
			],
			modes: [{ id: "read-only" }, { id: "agent-full-access" }],
			currentModeId: "agent-full-access",
			onSetMode: () => {},
			onSetConfigOption,
		}),
	);
	expect(result.current?.returnModeId).toBeUndefined();
	result.current?.enter();
	expect(onSetConfigOption).toHaveBeenLastCalledWith(
		"collaboration_mode",
		"plan",
	);
});

test("no control when the chat cannot apply the switch", () => {
	const { result } = renderHook(() =>
		usePlanControl({
			configOptions: [],
			modes: CLAUDE_MODES,
			currentModeId: "default",
			onSetMode: undefined,
			onSetConfigOption: undefined,
		}),
	);
	expect(result.current).toBeNull();
});
