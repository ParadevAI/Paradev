import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import {
	bug,
	disabledActions,
	editActions,
	editView,
	LONG_DESCRIPTION,
} from "../linearFixtures";
import { LinearEditBlock } from "./LinearEditBlock";

const meta = {
	component: LinearEditBlock,
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
		view: editView,
		actions: editActions,
		done: false,
		pending: false,
		failure: null,
		onAct: fn(),
	},
} satisfies Meta<typeof LinearEditBlock>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A new title, a changed description, and three changed properties. */
export const Default: Story = {};

/** "Edit" swaps the diff for the proposed text. */
export const EditingDescription: Story = {
	play: async ({ canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole("button", { name: "Edit" }));
	},
};

export const PropertiesOnly: Story = {
	args: {
		view: {
			...editView,
			proposed: {
				title: null,
				description: null,
				fields: { priority: 1, labels: [bug.id] },
			},
		},
	},
};

/** The agent wrote a description for an issue that had none. */
export const NewDescription: Story = {
	args: {
		view: {
			...editView,
			issue: { ...editView.issue, description: "" },
			proposed: { title: null, description: LONG_DESCRIPTION, fields: {} },
		},
	},
};

/** Nothing differs from the issue: Apply is off. */
export const NothingToChange: Story = {
	args: {
		view: {
			...editView,
			proposed: { title: null, description: null, fields: {} },
		},
	},
};

export const PriorityPickerOpen: Story = {
	play: async ({ canvasElement, userEvent }) => {
		await userEvent.click(
			canvasElement.querySelector('[data-field="priority"]') as Element,
		);
	},
};

/** Settled: the issue as Linear holds it. */
export const Resolved: Story = { args: { done: true } };

export const Pending: Story = { args: { pending: true } };

export const Failure: Story = {
	args: { failure: "The issue changed in Linear. Look again before you apply" },
};

export const NotAllowed: Story = {
	args: {
		actions: disabledActions(editActions, "Reconnect Linear to edit issues"),
	},
};
