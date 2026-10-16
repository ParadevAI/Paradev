import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, waitFor } from "storybook/test";
import {
	deploymentActions,
	deploymentMixedView,
	deploymentNoneActions,
	deploymentNoneView,
	deploymentTimerView,
	deploymentTwoView,
	deploymentView,
} from "../githubFixtures";
import { GithubDeploymentBlock } from "./GithubDeploymentBlock";

const meta = {
	component: GithubDeploymentBlock,
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
		view: deploymentView,
		actions: deploymentActions,
		done: false,
		pending: false,
		failure: null,
		onAct: fn(),
	},
} satisfies Meta<typeof GithubDeploymentBlock>;

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

export const OneEnvironment: Story = {};

export const TwoEnvironments: Story = { args: { view: deploymentTwoView } };

/** The reader reviews production and not the app store. */
export const OneNotApprovable: Story = { args: { view: deploymentMixedView } };

export const WaitTimer: Story = { args: { view: deploymentTimerView } };

export const ApproveConfirming: Story = {
	args: { view: deploymentTwoView },
	play: clicks("Approve and deploy"),
};

export const RejectConfirming: Story = {
	args: { view: deploymentTwoView },
	play: clicks("Reject"),
};

export const NothingWaiting: Story = {
	args: { view: deploymentNoneView, actions: deploymentNoneActions },
};

export const Pending: Story = { args: { pending: true } };

export const Done: Story = { args: { done: true } };
