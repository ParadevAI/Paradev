import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { ActionButton } from "./ActionButton";

const meta = {
	component: ActionButton,
	args: {
		action: {
			id: "reschedule",
			label: "Reschedule",
			style: "primary",
			role: "primary",
		},
		pending: false,
		children: "Reschedule",
		onClick: fn(),
	},
} satisfies Meta<typeof ActionButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Pending: Story = { args: { pending: true } };

/** The action wants a confirmation: the click opens it. */
export const Confirms: Story = {
	args: {
		action: {
			id: "cancel",
			label: "Cancel event",
			style: "danger",
			role: "primary",
			confirm: 'Cancel "Cloud rollout review" and tell its 2 guests?',
		},
		variant: "destructive",
		children: "Cancel event",
	},
	play: async ({ canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole("button", { name: "Cancel event" }));
	},
};

/** The block states the exact write, for an action whose amount the reader chose. */
export const ConfirmsTheWrite: Story = {
	args: {
		action: {
			id: "refund",
			label: "Refund",
			style: "primary",
			role: "primary",
		},
		confirmText:
			"Refund $25.00 of the $49.00 charge to Avery Chen's Visa •••• 4242?",
		children: "Refund",
	},
	play: async ({ canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole("button", { name: "Refund" }));
	},
};

/** The reader may see it but not take it: hover for the reason. */
export const NotAllowed: Story = {
	args: {
		action: {
			id: "reschedule",
			label: "Reschedule",
			style: "primary",
			role: "primary",
			disabled: "Only the organizer can move this event",
		},
	},
};
