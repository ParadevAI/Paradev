import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import {
	conflicts,
	guests,
	inviteActions,
	inviteView,
	prepDay,
} from "../calendarFixtures";
import { CalendarInviteBlock } from "./CalendarInviteBlock";

const answered = (response: "accepted" | "declined" | "tentative") => ({
	...inviteView,
	response,
	event: {
		...inviteView.event,
		guests: guests.map((guest) =>
			guest.self ? { ...guest, response } : guest,
		),
	},
});

const meta = {
	component: CalendarInviteBlock,
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
		view: inviteView,
		actions: inviteActions,
		done: false,
		pending: false,
		failure: null,
		onAct: fn(),
	},
} satisfies Meta<typeof CalendarInviteBlock>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Six guests in mixed states and three conflicts, waiting for an answer. */
export const NeedsAnswer: Story = {};

export const AnsweredYes: Story = { args: { view: answered("accepted") } };

/** One of the conflicts is an all-day event. */
export const AllDayConflict: Story = {
	args: { view: { ...inviteView, conflicts: [prepDay, ...conflicts] } },
};

export const NoConflicts: Story = {
	args: { view: { ...inviteView, conflicts: [] } },
};

/** The chevron is open: "Propose a new time" and "Add note". */
export const MoreOptions: Story = {
	play: async ({ canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole("button", { name: "More options" }));
	},
};

export const ProposePanelOpen: Story = {
	play: async ({ canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole("button", { name: "More options" }));
		await userEvent.click(
			canvas.getByRole("button", { name: "Propose a new time" }),
		);
	},
};

/** "Add a note" opens with the note the agent drafted. */
export const NoteDialogOpen: Story = {
	args: {
		view: {
			...answered("tentative"),
			note: "I have a dentist appointment that may run over. I'll join as soon as I'm out.",
		},
	},
	play: async ({ canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole("button", { name: "More options" }));
		await userEvent.click(canvas.getByRole("button", { name: "Add note" }));
	},
};

/** Answered and settled: the facts stay, the footer is gone. */
export const Resolved: Story = {
	args: { done: true, view: answered("accepted") },
};

export const Pending: Story = { args: { pending: true } };

export const Failure: Story = {
	args: { failure: "Google Calendar did not accept the answer. Try again." },
};

/** The reader may see the invitation but not answer it: hover a button for the reason. */
export const AnswerNotAllowed: Story = {
	args: {
		actions: inviteActions.map((action) => ({
			...action,
			disabled: "This invitation was forwarded to you",
		})),
	},
};

/** The event was cancelled: the answers are off. */
export const CannotRespond: Story = {
	args: {
		view: {
			...inviteView,
			canRespond: false,
			event: { ...inviteView.event, cancelled: true },
		},
		actions: inviteActions.map((action) => ({
			...action,
			disabled: "This event was cancelled",
		})),
	},
};

/** Gmail can't send for the reader: the message still goes on the answer, with the reason under it. */
export const ProposeWithoutEmail: Story = {
	args: { view: { ...inviteView, canEmailNote: false } },
	play: ProposePanelOpen.play,
};
