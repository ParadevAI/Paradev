import type { Meta, StoryObj } from "@storybook/react-vite";
import { type ComponentProps, useState } from "react";
import { fn } from "storybook/test";
import type { LinearFieldsView } from "../../types";
import {
	agentProject,
	bug,
	cycle1,
	desktop,
	done,
	editIssue,
	lena,
	options,
	riya,
	todo,
	triageIssue,
} from "../linearFixtures";
import { IssueFields } from "./IssueFields";

type Props = ComponentProps<typeof IssueFields<Partial<LinearFieldsView>>>;

function Held({ value, onChange, ...props }: Props) {
	const [held, setHeld] = useState(value);
	return (
		<IssueFields
			{...props}
			value={held}
			onChange={(next) => {
				onChange(next);
				setHeld(next);
			}}
		/>
	);
}

const meta = {
	component: IssueFields,
	render: (args) => <Held {...args} />,
	decorators: [
		(Story) => (
			<div className="-m-6 h-screen overflow-y-auto p-6">
				<div className="mx-auto max-w-3xl">
					<Story />
				</div>
			</div>
		),
	],
	args: {
		value: triageIssue.fields,
		options,
		teamName: "Agent Test",
		onChange: fn(),
	},
} satisfies Meta<typeof IssueFields<Partial<LinearFieldsView>>>;

export default meta;
type Story = StoryObj<typeof meta>;

const opens =
	(field: string): Story["play"] =>
	async ({ canvasElement, userEvent }) => {
		await userEvent.click(
			canvasElement.querySelector(`[data-field="${field}"]`) as Element,
		);
	};

/** Nothing set but the status: each chip reads its property's name. */
export const Default: Story = {};

export const AllSet: Story = {
	args: {
		value: {
			state: todo.id,
			priority: 2,
			assignee: lena.id,
			labels: [bug.id, desktop.id],
			cycle: cycle1.id,
			project: agentProject.id,
			estimate: 3,
		},
	},
};

/** The agent's suggestions as dashed chips; a click applies one. */
export const Suggestions: Story = {
	args: {
		suggested: { priority: 2, assignee: lena.id, labels: [bug.id, desktop.id] },
	},
};

/** Against what the issue holds: a changed chip shows old → new. */
export const Changed: Story = {
	args: {
		value: {
			...editIssue.fields,
			state: todo.id,
			priority: 3,
			assignee: riya.id,
		},
		baseline: editIssue.fields,
	},
};

/** Only the properties to change: the rest are untouched, and a cleared one reads "No assignee". */
export const Sparse: Story = {
	args: { value: { state: done.id, assignee: null }, sparse: true },
};

export const Disabled: Story = { args: { disabled: true } };

/** A team that does not estimate or run cycles. */
export const NoEstimatesOrCycles: Story = {
	args: { options: { ...options, estimates: [], cycles: [] } },
};

export const OnlyStatusAndLabels: Story = {
	args: { show: ["state", "labels"] },
};

export const StatusOpen: Story = { play: opens("state") };
export const PriorityOpen: Story = { play: opens("priority") };
export const AssigneeOpen: Story = { play: opens("assignee") };
export const ProjectOpen: Story = { play: opens("project") };
export const EstimateOpen: Story = { play: opens("estimate") };
export const LabelsOpen: Story = {
	args: { value: { ...triageIssue.fields, labels: [bug.id, desktop.id] } },
	play: opens("labels"),
};
export const CycleOpen: Story = { play: opens("cycle") };
