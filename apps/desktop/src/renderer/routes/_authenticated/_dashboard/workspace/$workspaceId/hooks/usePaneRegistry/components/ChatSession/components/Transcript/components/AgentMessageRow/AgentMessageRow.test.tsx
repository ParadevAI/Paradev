import { afterEach, beforeEach, expect, test } from "bun:test";
import type { AgentMessage } from "@superset/chat/protocol";
import { cleanup, render } from "@testing-library/react";
import { useSettings } from "renderer/stores/settings";
import { AgentMessageRow } from "./AgentMessageRow";

beforeEach(() => {
	useSettings.setState({ showMessageTimestamps: false });
});

afterEach(() => {
	cleanup();
	useSettings.setState({ showMessageTimestamps: false });
});

function message(overrides: Partial<AgentMessage> = {}): AgentMessage {
	return {
		id: "agent-1",
		kind: "agent_message",
		startedAtMs: 1_700_000_000_000,
		completedAtMs: 1_700_000_060_000,
		text: "The fix is in the settings store.",
		...overrides,
	};
}

function renderRow(item: AgentMessage, lastReply = false) {
	return render(
		<AgentMessageRow item={item} lastReply={lastReply} text={item.text} />,
	);
}

test("an earlier message shows no time and no extra row by default", () => {
	const view = renderRow(message());

	expect(view.container.querySelector("time")).toBeNull();
});

test("the last reply still reveals its time on hover by default", () => {
	const time = renderRow(message(), true).container.querySelector("time");

	expect(time?.textContent).toBeTruthy();
	expect(time?.parentElement?.className).toContain("opacity-0");
});

test("a settled message shows its time in place when the setting is on", () => {
	useSettings.setState({ showMessageTimestamps: true });
	const time = renderRow(message()).container.querySelector("time");

	expect(time?.textContent).toBeTruthy();
	expect(time?.parentElement?.className).not.toContain("opacity-0");
});

test("the setting shows the time once, not again in the reply footer", () => {
	useSettings.setState({ showMessageTimestamps: true });
	const view = renderRow(message(), true);

	expect(view.container.querySelectorAll("time")).toHaveLength(1);
});

test("a message that is still streaming shows no time", () => {
	useSettings.setState({ showMessageTimestamps: true });
	const view = renderRow(message({ completedAtMs: undefined }));

	expect(view.container.querySelector("time")).toBeNull();
});
