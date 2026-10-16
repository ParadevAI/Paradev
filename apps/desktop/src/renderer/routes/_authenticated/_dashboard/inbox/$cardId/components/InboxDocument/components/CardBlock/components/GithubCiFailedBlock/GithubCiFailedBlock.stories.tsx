import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, waitFor } from "storybook/test";
import {
	CI_STILL_RUNNING,
	ciActions,
	ciExternalOnlyView,
	ciPassingView,
	ciTwoRunsView,
	ciView,
	NO_FAILED_JOB,
} from "../githubFixtures";
import { off } from "../slackApprovalFixtures";
import { GithubCiFailedBlock } from "./GithubCiFailedBlock";

const meta = {
	component: GithubCiFailedBlock,
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
		view: ciView,
		actions: ciActions,
		done: false,
		pending: false,
		failure: null,
		onAct: fn(),
		StartAgent: ({ trigger }) => trigger,
	},
} satisfies Meta<typeof GithubCiFailedBlock>;

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

/** One failed job of one workflow run. */
export const Default: Story = {};

/** Two workflow runs, the first on its second attempt, a check from another app, and checks still running. */
export const TwoRuns: Story = { args: { view: ciTwoRunsView } };

const noRerun = (reason: string) =>
	off(off(ciActions, "rerun_failed", reason), "rerun_all", reason);

/** Only checks from other apps failed. */
export const ExternalCheckOnly: Story = {
	args: { view: ciExternalOnlyView, actions: noRerun(NO_FAILED_JOB) },
};

export const RerunFailedConfirming: Story = {
	play: clicks("Re-run failed jobs"),
};

export const RerunAllConfirming: Story = { play: clicks("Re-run all jobs") };

/** The workflow is running again. */
export const Running: Story = {
	args: {
		view: {
			...ciView,
			runs: ciView.runs.map((run) => ({ ...run, running: true })),
			pending: 4,
		},
		actions: noRerun(CI_STILL_RUNNING),
	},
};

/** More failed jobs than the card shows. */
export const JobsOmitted: Story = {
	args: { view: { ...ciTwoRunsView, omitted: 6, failing: 9 } },
};

export const NoFailingChecks: Story = {
	args: {
		view: ciPassingView,
		actions: noRerun(NO_FAILED_JOB).filter((each) => each.id !== "started"),
	},
};

export const Failed: Story = {
	args: { failure: "GitHub did not answer. Try again" },
};

export const Pending: Story = { args: { pending: true } };

export const Done: Story = { args: { done: true } };
