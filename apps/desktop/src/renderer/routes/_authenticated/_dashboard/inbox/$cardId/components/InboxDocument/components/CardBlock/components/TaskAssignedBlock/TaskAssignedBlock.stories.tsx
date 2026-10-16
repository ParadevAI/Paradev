import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import {
	taskActions,
	taskAssignedView,
	taskBareView,
	taskDetailedView,
	taskLongView,
	taskWithWorkspacesView,
} from "../supersetFixtures";
import { SupersetStoryApp } from "../supersetStoryKit";
import { TaskAssignedBlock } from "./TaskAssignedBlock";

const meta = {
	component: TaskAssignedBlock,
	decorators: [
		(Story) => (
			<SupersetStoryApp>
				<div className="-m-6 h-screen overflow-y-auto p-6">
					<div className="mx-auto max-w-2xl overflow-hidden rounded-lg border border-border bg-card">
						<Story />
					</div>
				</div>
			</SupersetStoryApp>
		),
	],
	args: {
		view: taskAssignedView,
		actions: taskActions,
		done: false,
		pending: false,
		failure: null,
		onAct: fn(),
	},
} satisfies Meta<typeof TaskAssignedBlock>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A task with no workspace on it yet. */
export const Default: Story = {};

/** Two cloud workspaces are already working on it. */
export const WithWorkspaces: Story = { args: { view: taskWithWorkspacesView } };

/** Labels, a due date and a description longer than the six lines the card shows. */
export const LabelsDueDateLongDescription: Story = {
	args: { view: taskDetailedView },
};

/** No assignee, no description, and a branch already named. */
export const NoAssigneeWithBranch: Story = { args: { view: taskBareView } };

export const Pending: Story = { args: { pending: true } };

export const Failure: Story = {
	args: { failure: "That task no longer exists" },
};

export const Resolved: Story = {
	args: { view: taskWithWorkspacesView, done: true },
};

export const LongContent: Story = { args: { view: taskLongView } };
