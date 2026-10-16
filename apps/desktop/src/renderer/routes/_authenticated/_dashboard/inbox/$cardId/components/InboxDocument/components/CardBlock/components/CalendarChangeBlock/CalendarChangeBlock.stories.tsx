import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { cancelView, changeActions, rescheduleView } from "../calendarFixtures";
import { CalendarChangeBlock } from "./CalendarChangeBlock";

const rescheduleActions = changeActions.filter(
	(action) => action.id !== "cancel",
);
const cancelActions = changeActions
	.filter((action) => action.id !== "reschedule")
	.map((action) =>
		action.id === "keep" ? { ...action, label: "Keep event" } : action,
	);

const meta = {
	component: CalendarChangeBlock,
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
		view: rescheduleView,
		actions: rescheduleActions,
		done: false,
		pending: false,
		failure: null,
		onAct: fn(),
	},
} satisfies Meta<typeof CalendarChangeBlock>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The agent wants the review moved a day; the new time overlaps lunch. */
export const Reschedule: Story = {};

export const RescheduleNoConflicts: Story = {
	args: {
		view: {
			...rescheduleView,
			proposal: {
				start: "2037-10-08T14:00:00-07:00",
				end: "2037-10-08T15:00:00-07:00",
			},
			conflicts: [],
		},
	},
};

/** No time suggested: the fields open on the current time and "Reschedule" waits for a move. */
export const RescheduleNoProposal: Story = {
	args: { view: { ...rescheduleView, proposal: null, conflicts: [] } },
};

export const Cancel: Story = {
	args: { view: cancelView, actions: cancelActions },
};

export const Resolved: Story = { args: { done: true } };

export const Pending: Story = { args: { pending: true } };

export const Failure: Story = {
	args: { failure: "Google Calendar did not move the event. Try again." },
};

/** The reader is not the organizer: hover "Reschedule" for the reason. */
export const ChangeNotAllowed: Story = {
	args: {
		view: { ...rescheduleView, canChange: false },
		actions: rescheduleActions.map((action) =>
			action.id === "reschedule"
				? { ...action, disabled: "Only the organizer can change this event" }
				: action,
		),
	},
};

/** Gmail can't send for the reader: the note box is off, with the reason under it. */
export const NoteNotEmailed: Story = {
	args: { view: { ...rescheduleView, canEmailNote: false } },
};

/** The event was already cancelled: keeping and moving are off with the reason, cancelling settles the card. */
export const AlreadyCancelled: Story = {
	args: {
		view: {
			...cancelView,
			canChange: false,
			event: { ...cancelView.event, cancelled: true },
		},
		actions: cancelActions.map((action) =>
			action.id === "keep"
				? { ...action, disabled: "This event was already cancelled" }
				: action,
		),
	},
};

/** "Cancel event" asks first. */
export const CancelConfirm: Story = {
	args: { view: cancelView, actions: cancelActions },
	play: async ({ canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole("button", { name: "Cancel event" }));
	},
};
