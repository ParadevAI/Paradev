import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { busy, event, inviteActions, week } from "../../../calendarFixtures";
import { ProposePanel } from "./ProposePanel";

const meta = {
	component: ProposePanel,
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
		event,
		busy,
		window: week,
		note: "",
		organizerEmailed: true,
		action: inviteActions[1],
		pending: false,
		onSend: fn(),
		onClose: fn(),
	},
} satisfies Meta<typeof ProposePanel>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Opens on the event's own time, which cannot be proposed until it is moved. */
export const Default: Story = {};

export const Sending: Story = { args: { pending: true } };

export const OrganizerNotEmailed: Story = { args: { organizerEmailed: false } };
