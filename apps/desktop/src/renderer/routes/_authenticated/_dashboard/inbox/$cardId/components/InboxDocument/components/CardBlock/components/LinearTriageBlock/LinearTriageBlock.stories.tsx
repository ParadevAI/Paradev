import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import {
	backlog,
	bug,
	disabledActions,
	LONG_DESCRIPTION,
	lena,
	options,
	suggestedTriageView,
	triageActions,
	triageView,
} from "../linearFixtures";
import { LinearTriageBlock } from "./LinearTriageBlock";

const meta = {
	component: LinearTriageBlock,
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
		view: triageView,
		actions: triageActions,
		done: false,
		pending: false,
		failure: null,
		onAct: fn(),
	},
} satisfies Meta<typeof LinearTriageBlock>;

export default meta;
type Story = StoryObj<typeof meta>;

const clicks =
	(...names: string[]): Story["play"] =>
	async ({ canvas, userEvent }) => {
		for (const name of names)
			await userEvent.click(canvas.getByRole("button", { name }));
	};

/** An issue in triage: the status is preset to Backlog, nothing else is set. */
export const Default: Story = {};

/** The agent suggests a priority, an assignee and two labels, drafted a comment, and named the issue this one may repeat. */
export const Suggestions: Story = { args: { view: suggestedTriageView } };

export const StatusPickerOpen: Story = {
	play: async ({ canvasElement, userEvent }) => {
		await userEvent.click(
			canvasElement.querySelector('[data-field="state"]') as Element,
		);
	},
};

export const LabelsPickerOpen: Story = {
	args: { view: suggestedTriageView },
	play: async ({ canvasElement, userEvent }) => {
		await userEvent.click(
			canvasElement.querySelector('[data-field="labels"]') as Element,
		);
	},
};

/** Decline opens the reason editor. */
export const Decline: Story = { play: clicks("Decline") };

/** Linear's duplicate confirmation: the issue in view and the one it repeats. */
export const DuplicateConfirm: Story = {
	args: { view: suggestedTriageView },
	play: clicks("Mark as duplicate"),
};

export const SnoozeMenu: Story = { play: clicks("Snooze") };

/** The team needs a priority before an issue leaves triage: Accept is off until one is set. */
export const PriorityRequired: Story = {
	args: { view: { ...triageView, priorityRequired: true } },
};

/** A team that does not estimate or run cycles: no chip for either, and no "Next cycle" to snooze to. */
export const NoEstimatesOrCycles: Story = {
	args: {
		view: {
			...triageView,
			options: { ...options, estimates: [], cycles: [] },
		},
	},
};

export const LongDescription: Story = {
	args: {
		view: {
			...triageView,
			issue: { ...triageView.issue, description: LONG_DESCRIPTION },
		},
	},
};

export const NoDescription: Story = {
	args: {
		view: { ...triageView, issue: { ...triageView.issue, description: "" } },
	},
};

export const Snoozed: Story = {
	args: { view: { ...triageView, snoozedUntil: "2037-10-05T16:00:00.000Z" } },
};

/** Accepted and settled: the issue with the properties it now has. */
export const Resolved: Story = {
	args: {
		done: true,
		view: {
			...triageView,
			issue: {
				...triageView.issue,
				state: backlog,
				fields: {
					...triageView.issue.fields,
					state: backlog.id,
					priority: 2,
					assignee: lena.id,
					labels: [bug.id],
				},
			},
		},
	},
};

export const Pending: Story = {
	args: { pending: true, view: suggestedTriageView },
};

export const Failure: Story = {
	args: {
		failure: "The issue changed in Linear. Look again before you accept",
	},
};

/** The issue left triage in Linear: hover a button for the reason. */
export const NoLongerInTriage: Story = {
	args: {
		view: suggestedTriageView,
		actions: disabledActions(triageActions, "AGT-2 is no longer in triage"),
	},
};
