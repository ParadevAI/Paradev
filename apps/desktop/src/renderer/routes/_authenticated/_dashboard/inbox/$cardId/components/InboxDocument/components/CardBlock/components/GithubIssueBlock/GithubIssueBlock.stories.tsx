import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, waitFor } from "storybook/test";
import {
	CANNOT_TRIAGE,
	issueActions,
	issueClosedActions,
	issueClosedView,
	issueDuplicateActions,
	issueDuplicateView,
	issueNoSuggestionView,
	issueView,
} from "../githubFixtures";
import { off } from "../slackApprovalFixtures";
import { GithubIssueBlock } from "./GithubIssueBlock";

const meta = {
	component: GithubIssueBlock,
	decorators: [
		(Story) => (
			<div className="-m-6 h-screen overflow-y-auto p-6">
				<div className="mx-auto max-w-2xl overflow-hidden rounded-lg border border-border bg-card">
					<Story />
				</div>
			</div>
		),
	],
	args: {
		view: issueView,
		actions: issueActions,
		done: false,
		pending: false,
		failure: null,
		onAct: fn(),
	},
} satisfies Meta<typeof GithubIssueBlock>;

export default meta;
type Story = StoryObj<typeof meta>;

const clicks =
	(...names: (string | RegExp)[]): Story["play"] =>
	async ({ canvas, userEvent }) => {
		for (const name of names) {
			const button = await canvas.findByRole("button", { name });
			await waitFor(() => expect(button).toBeEnabled());
			await userEvent.click(button);
		}
	};

const opens =
	(field: "labels" | "assignees"): Story["play"] =>
	async ({ canvasElement }) => {
		const chip = canvasElement.querySelector<HTMLElement>(
			`[data-field="${field}"]`,
		);
		if (chip) await userEvent.click(chip);
	};

/** The agent's labels and assignee are chosen already, against what the issue holds. */
export const Default: Story = {};

export const LabelsOpen: Story = { play: opens("labels") };

export const AssigneesOpen: Story = { play: opens("assignees") };

export const ApplyConfirming: Story = { play: clicks("Apply") };

/** The issue holds what the card would set. */
export const NothingChanged: Story = { args: { view: issueNoSuggestionView } };

export const Duplicate: Story = {
	args: { view: issueDuplicateView, actions: issueDuplicateActions },
};

export const CloseDuplicateConfirming: Story = {
	args: { view: issueDuplicateView, actions: issueDuplicateActions },
	play: clicks("Close as duplicate"),
};

export const CannotTriage: Story = {
	args: {
		view: issueDuplicateView,
		actions: off(
			off(issueDuplicateActions, "apply", CANNOT_TRIAGE),
			"close_duplicate",
			CANNOT_TRIAGE,
		),
	},
};

export const Closed: Story = {
	args: { view: issueClosedView, actions: issueClosedActions },
};

export const NoBody: Story = {
	args: { view: { ...issueView, issue: { ...issueView.issue, body: "" } } },
};

export const Done: Story = {
	args: { view: issueNoSuggestionView, done: true },
};
