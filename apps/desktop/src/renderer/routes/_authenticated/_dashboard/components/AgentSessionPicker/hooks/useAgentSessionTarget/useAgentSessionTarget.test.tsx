import { afterEach, expect, test } from "bun:test";
import { act, cleanup, renderHook } from "@testing-library/react";
import type { TerminalAgentBinding } from "renderer/hooks/host-service/useTerminalAgentBindings";
import { useAgentSessionTarget } from "./useAgentSessionTarget";

afterEach(() => {
	cleanup();
	window.localStorage.clear();
});

test("the selected chat keeps its own session identity", () => {
	const sessions = [
		{ terminalId: "term-a", chatSessionId: "chat-a" },
		{ terminalId: "term-b", chatSessionId: "chat-b" },
	] as TerminalAgentBinding[];
	const { result } = renderHook(() =>
		useAgentSessionTarget({ sessions, configs: [] }),
	);
	act(() => result.current.onValueChange("existing:term-b"));
	expect(result.current.resolved).toEqual({
		kind: "existing",
		terminalId: "term-b",
		chatSessionId: "chat-b",
	});
});

test("the currently open chat takes priority over an old selection", () => {
	window.localStorage.setItem("lastSelectedDiffCommentTerminalId", "term-a");
	const sessions = [
		{ terminalId: "term-a", chatSessionId: "chat-a" },
		{ terminalId: "term-b", chatSessionId: "chat-b" },
	] as TerminalAgentBinding[];
	const { result } = renderHook(() =>
		useAgentSessionTarget({
			sessions,
			configs: [],
			preferredTerminalId: "term-b",
		}),
	);
	expect(result.current.resolved).toEqual({
		kind: "existing",
		terminalId: "term-b",
		chatSessionId: "chat-b",
	});
	act(() => result.current.onValueChange("existing:term-a"));
	expect(
		result.current.resolved?.kind === "existing" &&
			result.current.resolved.chatSessionId,
	).toBe("chat-a");
});

test("does not send to a different chat while the current chat is missing", () => {
	const sessions = [
		{ terminalId: "term-a", chatSessionId: "chat-a" },
	] as TerminalAgentBinding[];
	const { result } = renderHook(() =>
		useAgentSessionTarget({
			sessions,
			configs: [],
			preferredTerminalId: "term-b",
		}),
	);
	expect(result.current.resolved).toBeNull();
	act(() => result.current.onValueChange("existing:term-a"));
	expect(
		result.current.resolved?.kind === "existing" &&
			result.current.resolved.chatSessionId,
	).toBe("chat-a");
});
