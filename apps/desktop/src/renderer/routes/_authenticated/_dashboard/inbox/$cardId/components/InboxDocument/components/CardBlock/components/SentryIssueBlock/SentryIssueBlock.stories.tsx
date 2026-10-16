import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, waitFor } from "storybook/test";
import {
	ALREADY_FILED,
	FILED,
	sentryActions,
	sentryAssignedView,
	sentryFiledView,
	sentryNoLinearView,
	sentryResolvedView,
	sentryView,
} from "../handoffFixtures";
import { off } from "../slackApprovalFixtures";
import { SentryIssueBlock } from "./SentryIssueBlock";

const meta = {
	component: SentryIssueBlock,
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
		view: sentryView,
		actions: sentryActions,
		done: false,
		pending: false,
		failure: null,
		onAct: fn(),
		StartAgent: ({ trigger }) => trigger,
	},
} satisfies Meta<typeof SentryIssueBlock>;

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

/** An unresolved error nobody has. */
export const Default: Story = {};

export const Assigned: Story = { args: { view: sentryAssignedView } };

export const AssigneeOpen: Story = { play: clicks("Assignee") };

/** Sentry's own question for Resolve, from the server. */
export const ResolveConfirming: Story = { play: clicks("Resolve") };

export const FilingInLinear: Story = { play: clicks("File in Linear") };

/** The question names the issue and the note that links it. */
export const FileConfirming: Story = {
	play: clicks("File in Linear", "File issue"),
};

/** The issue is filed and the note on the Sentry issue failed. */
export const FiledNotNoted: Story = {
	args: {
		view: { ...sentryView, filed: FILED },
		actions: sentryActions.map((action) =>
			action.id === "file_linear"
				? { ...action, label: "Add the note" }
				: action,
		),
		failure: "Sentry did not answer. Try again",
	},
};

export const Filed: Story = {
	args: {
		view: sentryFiledView,
		actions: off(sentryActions, "file_linear", ALREADY_FILED),
	},
};

/** The agent proposed no Linear issue. */
export const NoLinearDraft: Story = {
	args: {
		view: sentryNoLinearView,
		actions: sentryActions.filter((action) => action.id !== "file_linear"),
	},
};

export const LinearUnavailable: Story = {
	args: {
		view: {
			...sentryNoLinearView,
			linearUnavailable: "Linear has no team with that key for you",
		},
		actions: sentryActions.filter((action) => action.id !== "file_linear"),
	},
};

export const DisabledWithReason: Story = {
	args: {
		view: sentryResolvedView,
		actions: off(sentryActions, "resolve", "Already resolved"),
	},
};

export const Warning: Story = {
	args: {
		view: {
			...sentryView,
			issue: {
				...sentryView.issue,
				level: "warning",
				status: "ignored",
				culprit: null,
				error: { type: null, value: null, filename: null, function: null },
			},
		},
	},
};

export const Pending: Story = { args: { pending: true } };

export const Done: Story = { args: { view: sentryResolvedView, done: true } };
