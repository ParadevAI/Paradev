import { afterEach, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { SubagentNotice } from "./SubagentNotice";

afterEach(cleanup);

test("a subagent that takes messages says where they go and offers the way back", () => {
	const onBack = mock(() => {});
	const view = render(
		<SubagentNotice
			onBack={onBack}
			parentTitle={null}
			target={{ name: "Explore", onStop: () => {} }}
		/>,
	);
	const text = view.container.textContent ?? "";
	expect(text).toContain("Viewing subagent Explore");
	expect(text).toContain("Messages you send go to Explore.");
	expect(view.queryByText("Stop")).toBeNull();
	fireEvent.click(view.getByText("Back to main chat"));
	expect(onBack).toHaveBeenCalledTimes(1);
});

test("an agent that can't steer its subagents explains why and still offers Stop", () => {
	const onStop = mock(() => {});
	const view = render(
		<SubagentNotice
			agentLabel="Claude"
			onBack={() => {}}
			parentTitle="Plan the work"
			target={{
				name: "Explore",
				disabledReason: "Explore can't be messaged",
				blockedBy: "agent",
				onStop,
			}}
		/>,
	);
	expect(view.container.textContent).toContain(
		"Claude doesn't let you message its subagents.",
	);
	expect(view.getByText("Back to Plan the work")).toBeTruthy();
	fireEvent.click(view.getByText("Stop"));
	expect(onStop).toHaveBeenCalledTimes(1);
});

test("Escape inside the notice goes back and stops there", () => {
	const onBack = mock(() => {});
	const outer = mock(() => {});
	const view = render(
		// biome-ignore lint/a11y/noStaticElementInteractions: stands in for the drawer's own key handler
		<div onKeyDown={outer}>
			<SubagentNotice
				onBack={onBack}
				parentTitle={null}
				target={{ name: "Explore" }}
			/>
		</div>,
	);
	fireEvent.keyDown(view.getByText("Back to main chat"), { key: "Escape" });
	expect(onBack).toHaveBeenCalledTimes(1);
	expect(outer).not.toHaveBeenCalled();
});
