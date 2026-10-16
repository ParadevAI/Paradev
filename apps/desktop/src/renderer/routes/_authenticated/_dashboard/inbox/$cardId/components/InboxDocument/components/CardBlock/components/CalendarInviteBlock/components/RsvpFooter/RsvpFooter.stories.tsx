import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { inviteActions } from "../../../calendarFixtures";
import { RsvpFooter } from "./RsvpFooter";

const [rsvp, propose] = inviteActions;

const meta = {
	component: RsvpFooter,
	args: {
		response: "needsAction",
		rsvp,
		propose,
		pending: false,
		onRsvp: fn(),
		onPropose: fn(),
		onNote: fn(),
	},
} satisfies Meta<typeof RsvpFooter>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Unanswered: Story = {};

export const SaidMaybe: Story = { args: { response: "tentative" } };

/** The chevron opens "Propose a new time" and "Add note". */
export const Expanded: Story = {
	play: async ({ canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole("button", { name: "More options" }));
	},
};

export const Pending: Story = { args: { pending: true } };
