import type { Meta, StoryObj } from "@storybook/react-vite";
import {
	backlog,
	canceled,
	done,
	inProgress,
	todo,
	triage,
} from "../linearFixtures";
import { LinearStateIcon } from "./LinearStateIcon";

const meta = {
	component: LinearStateIcon,
	render: (args) => (
		<span className="inline-flex items-center gap-2 text-[13px]">
			<LinearStateIcon {...args} />
			{args.state.type}
		</span>
	),
	args: { state: todo },
} satisfies Meta<typeof LinearStateIcon>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Todo: Story = {};
export const Triage: Story = { args: { state: triage } };
export const Backlog: Story = { args: { state: backlog } };
export const InProgress: Story = { args: { state: inProgress } };
export const Done: Story = { args: { state: done } };
export const Canceled: Story = { args: { state: canceled } };
