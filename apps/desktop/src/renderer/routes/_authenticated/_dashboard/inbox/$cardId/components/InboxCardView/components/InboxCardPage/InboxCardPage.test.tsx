import { describe, expect, test } from "bun:test";
import { stripeTestKit } from "renderer/routes/_authenticated/_dashboard/inbox/$cardId/components/InboxDocument/components/CardBlock/components/stripeTestKit";

const { render } = await stripeTestKit();
const { InboxCardPage } = await import("./InboxCardPage");

const base = {
	title: "Wave map is ready to look at",
	why: "I need your eyes on the colours",
	sender: { name: "Claude", workspace: "Wave map" },
	outcome: null,
};

describe("the page a card has when it was sent with none", () => {
	test("the title, the reason in quotes, who sent it and from which workspace, and the body", () => {
		const view = render(
			<InboxCardPage {...base} body="Three palettes, as in the brief." />,
		);
		expect(view.getByRole("heading", { level: 1 }).textContent).toBe(
			base.title,
		);
		expect(view.getByText("“I need your eyes on the colours”")).toBeTruthy();
		expect(view.getByText("Claude · Wave map")).toBeTruthy();
		expect(view.getByText("Three palettes, as in the brief.")).toBeTruthy();
	});

	test("the card's document, with its integration cards and their actions, sits under the body", () => {
		const view = render(
			<InboxCardPage {...base}>
				<button type="button">Approve refund</button>
			</InboxCardPage>,
		);
		expect(view.getByRole("button", { name: "Approve refund" })).toBeTruthy();
	});

	test("a sender with no workspace is named alone, and no sender leaves the line out", () => {
		const alone = render(
			<InboxCardPage {...base} sender={{ name: "Superset" }} />,
		);
		expect(alone.getByText("Superset")).toBeTruthy();
		alone.unmount();
		const none = render(<InboxCardPage {...base} sender={null} />);
		expect(none.queryByText("From")).toBeNull();
	});

	test("an open card shows no outcome; a settled one says how it ended and what the action answered", () => {
		const open = render(<InboxCardPage {...base} />);
		expect(open.queryByText("Answered")).toBeNull();
		open.unmount();
		const settled = render(
			<InboxCardPage
				{...base}
				outcome={{ label: "Answered", note: "Sent to the agent" }}
			/>,
		);
		expect(settled.getByText("Answered")).toBeTruthy();
		expect(settled.getByText("Sent to the agent")).toBeTruthy();
	});
});
