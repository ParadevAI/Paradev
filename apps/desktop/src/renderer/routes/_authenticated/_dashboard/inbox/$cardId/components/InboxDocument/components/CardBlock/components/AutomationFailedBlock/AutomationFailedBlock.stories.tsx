import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import {
	automationActions,
	automationCloudView,
	automationFailedView,
	automationLongView,
	automationNotOwnerActions,
	automationRecoveredView,
	automationSkippedView,
	automationUnknownView,
} from "../supersetFixtures";
import { AutomationFailedBlock } from "./AutomationFailedBlock";

const meta = {
	component: AutomationFailedBlock,
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
		view: automationFailedView,
		actions: automationActions,
		done: false,
		pending: false,
		failure: null,
		onAct: fn(),
	},
} satisfies Meta<typeof AutomationFailedBlock>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A run on a device that failed: the host's error, then what to do about it. */
export const Default: Story = {};

/** The schedule came due with no host online. Nothing ran, so there is no error box. */
export const NeverStarted: Story = { args: { view: automationSkippedView } };

/** Runs after this one, newest first. One that never ran cannot be opened. */
export const LaterRunsSucceeded: Story = {
	args: { view: automationRecoveredView },
};

export const CloudTarget: Story = { args: { view: automationCloudView } };

/** A device with no name, a status the app does not know and an error with no guidance. */
export const UnknownStatus: Story = { args: { view: automationUnknownView } };

/** Hover "Retry" for the reason. */
export const NotTheOwner: Story = {
	args: { actions: automationNotOwnerActions },
};

export const Pending: Story = { args: { pending: true } };

export const Failure: Story = {
	args: { failure: "A run of this automation is already in progress" },
};

export const Resolved: Story = {
	args: { view: automationRecoveredView, done: true },
};

export const LongContent: Story = { args: { view: automationLongView } };
