import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, screen, waitFor } from "storybook/test";
import {
	BRANCH_COMPUTING,
	BRANCH_CURRENT,
	branchActions,
	branchComputingView,
	branchConflictsActions,
	branchConflictsView,
	branchCurrentView,
	branchForkView,
	branchManyBehindView,
	branchView,
	FORK_NO_PUSH,
} from "../githubFixtures";
import { off } from "../slackApprovalFixtures";
import { GithubBranchBlock } from "./GithubBranchBlock";

const meta = {
	component: GithubBranchBlock,
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
		view: branchView,
		actions: branchActions,
		done: false,
		pending: false,
		failure: null,
		onAct: fn(),
		StartAgent: ({ trigger }) => trigger,
	},
} satisfies Meta<typeof GithubBranchBlock>;

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

const MENU = "Choose how to update the branch";

const settled = (reason: string) =>
	off(branchActions, "update", reason).filter((each) => each.id !== "started");

export const Behind: Story = {};

/** More commits behind than the card lists. */
export const FarBehind: Story = { args: { view: branchManyBehindView } };

export const Conflicts: Story = {
	args: { view: branchConflictsView, actions: branchConflictsActions },
};

export const Computing: Story = {
	args: {
		view: branchComputingView,
		actions: settled(BRANCH_COMPUTING),
	},
};

export const UpToDate: Story = {
	args: {
		view: branchCurrentView,
		actions: settled(BRANCH_CURRENT),
	},
};

export const UpdateMenuOpen: Story = { play: clicks(MENU) };

export const MergeConfirming: Story = { play: clicks("Update branch") };

export const RebaseConfirming: Story = {
	play: async (context) => {
		await clicks(MENU)?.(context);
		await context.userEvent.click(
			await screen.findByRole("menuitemradio", { name: "Update with rebase" }),
		);
		await clicks("Update with rebase")?.(context);
	},
};

/** A branch the reader cannot push to. */
export const CannotPush: Story = {
	args: {
		view: branchForkView,
		actions: off(branchActions, "update", FORK_NO_PUSH),
	},
};

export const Pending: Story = { args: { pending: true } };

export const Done: Story = { args: { view: branchCurrentView, done: true } };
