import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import {
	findTimeActions,
	findTimeView,
	slackFindTimeView,
} from "../calendarFixtures";
import { CalendarFindTimeBlock } from "./CalendarFindTimeBlock";

const meta = {
	component: CalendarFindTimeBlock,
	decorators: [
		(Story) => (
			<div className="-m-6 h-screen overflow-y-auto p-6">
				<div className="mx-auto max-w-3xl overflow-hidden rounded-lg border border-border bg-card">
					<Story />
				</div>
			</div>
		),
	],
	args: {
		view: findTimeView,
		actions: findTimeActions,
		done: false,
		pending: false,
		failure: null,
		onAct: fn(),
	},
} satisfies Meta<typeof CalendarFindTimeBlock>;

export default meta;
type Story = StoryObj<typeof meta>;

/** An email asked to meet: the first three open times are picked and listed under the reply. */
export const GmailAsk: Story = {};

/** A Slack ask; one guest is not on the thread. */
export const SlackAsk: Story = { args: { view: slackFindTimeView } };

/** "Create event" asks first, with the server's sentence. */
export const CreateConfirm: Story = {
	args: { view: { ...findTimeView, slots: findTimeView.slots.slice(0, 1) } },
	play: async ({ canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole("button", { name: "Create event" }));
	},
};

/** No open times were found: the reader picks from the grid. */
export const NoSuggestions: Story = {
	args: { view: { ...findTimeView, slots: [] } },
};

/** One time picked: "Create event" sits beside "Send reply". */
export const OneSuggestion: Story = {
	args: { view: { ...findTimeView, slots: findTimeView.slots.slice(0, 1) } },
};

export const Resolved: Story = { args: { done: true } };

export const Pending: Story = { args: { pending: true } };

export const Failure: Story = {
	args: { failure: "Gmail did not send the reply. Try again." },
};

/** The account the ask came through is not connected: hover "Send reply" for the reason; the event can still be created. */
export const ReplyNotAllowed: Story = {
	args: {
		actions: findTimeActions.map((action) =>
			action.id === "offer"
				? {
						...action,
						disabled: "Connect the account the ask came through to reply",
					}
				: action,
		),
		view: { ...slackFindTimeView, canReply: false },
	},
};
