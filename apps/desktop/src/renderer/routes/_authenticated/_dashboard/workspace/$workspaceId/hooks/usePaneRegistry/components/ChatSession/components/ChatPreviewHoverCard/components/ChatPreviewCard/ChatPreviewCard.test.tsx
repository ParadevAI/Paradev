import { afterEach, expect, test } from "bun:test";
import { cleanup, render } from "@testing-library/react";
import { ChatPreviewCard } from "./ChatPreviewCard";

afterEach(cleanup);

test("shows the chat's title and its last messages", () => {
	const view = render(
		<ChatPreviewCard
			load={{
				status: "ready",
				title: "Fix login",
				messages: [
					{ id: "u1", from: "user", text: "Why does login fail?" },
					{ id: "a1", from: "agent", text: "The token check is inverted." },
				],
			}}
		/>,
	);
	expect(view.container.textContent).toContain("Fix login");
	expect(view.getAllByRole("listitem").map((item) => item.textContent)).toEqual(
		["Why does login fail?", "The token check is inverted."],
	);
});

test("says the same thing for a removed chat and one out of reach", () => {
	const view = render(<ChatPreviewCard load={{ status: "unavailable" }} />);
	expect(view.container.textContent).toContain(
		"This chat may have been removed or you may not have access.",
	);
	expect(view.container.textContent).toContain("Chat");
});
