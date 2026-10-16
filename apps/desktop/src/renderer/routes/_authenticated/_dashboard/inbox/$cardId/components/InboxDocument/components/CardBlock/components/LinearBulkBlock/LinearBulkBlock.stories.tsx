import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import {
	bug,
	bulkActions,
	bulkView,
	cycle1,
	desktop,
	disabledActions,
	inProgress,
	options,
	riya,
} from "../linearFixtures";
import { LinearBulkBlock } from "./LinearBulkBlock";

const meta = {
	component: LinearBulkBlock,
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
		view: bulkView,
		actions: bulkActions,
		done: false,
		pending: false,
		failure: null,
		onAct: fn(),
	},
} satisfies Meta<typeof LinearBulkBlock>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Five issues to close as Done, with a comment for each. */
export const Close: Story = {};

/** Move the issues: a status, an assignee and a cycle for all of them. */
export const Move: Story = {
	args: {
		view: {
			...bulkView,
			proposed: { state: inProgress.id, assignee: riya.id, cycle: cycle1.id },
			comment: "",
		},
	},
};

/** Labels to add to every issue; each keeps the ones it has. */
export const AddLabels: Story = {
	args: {
		view: {
			...bulkView,
			proposed: { labels: [bug.id, desktop.id] },
			comment: "",
		},
	},
};

export const OneUnchecked: Story = {
	play: async ({ canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole("checkbox", { name: "AGT-9" }));
	},
};

/** Apply asks first, with the server's sentence. */
export const Confirming: Story = {
	play: async ({ canvas, userEvent }) => {
		await userEvent.click(
			canvas.getByRole("button", { name: "Close 5 issues" }),
		);
	},
};

export const AssigneePickerOpen: Story = {
	play: async ({ canvasElement, userEvent }) => {
		await userEvent.click(
			canvasElement.querySelector('[data-field="assignee"]') as Element,
		);
	},
};

export const NoEstimatesOrCycles: Story = {
	args: {
		view: { ...bulkView, options: { ...options, estimates: [], cycles: [] } },
	},
};

/** Settled: the issues and the change, no controls. */
export const Resolved: Story = { args: { done: true } };

export const Pending: Story = { args: { pending: true } };

export const Failure: Story = {
	args: { failure: "Linear refused the change" },
};

export const NotAllowed: Story = {
	args: {
		actions: disabledActions(bulkActions, "Reconnect Linear to edit issues"),
	},
};
