import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { cycle1, cycle2 } from "../../../linearFixtures";
import { SnoozeMenu } from "./SnoozeMenu";

const meta = {
	component: SnoozeMenu,
	args: {
		action: {
			id: "snooze",
			label: "Snooze",
			style: "secondary",
			role: "other",
		},
		pending: false,
		cycles: [cycle1, cycle2],
		onSnooze: fn(),
	},
} satisfies Meta<typeof SnoozeMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Closed: Story = {};

export const Open: Story = {
	play: async ({ canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole("button", { name: "Snooze" }));
	},
};

export const NoCycles: Story = { args: { cycles: [] }, play: Open.play };

/** "Custom…" asks for a date and time. */
export const Custom: Story = {
	play: async ({ canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole("button", { name: "Snooze" }));
		await userEvent.click(
			document.body.querySelector('[data-snooze="custom"]') as Element,
		);
	},
};

export const NotAllowed: Story = {
	args: {
		action: {
			id: "snooze",
			label: "Snooze",
			style: "secondary",
			role: "other",
			disabled: "AGT-2 is no longer in triage",
		},
	},
};
