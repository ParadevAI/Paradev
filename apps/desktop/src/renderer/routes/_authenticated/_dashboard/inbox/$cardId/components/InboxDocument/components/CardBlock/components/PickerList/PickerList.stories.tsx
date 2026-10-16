import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { LinearStateIcon } from "../LinearStateIcon";
import { backlog, states } from "../linearFixtures";
import { PickerList } from "./PickerList";

const meta = {
	component: PickerList,
	decorators: [
		(Story) => (
			<div className="w-64 rounded-md border border-border bg-popover">
				<Story />
			</div>
		),
	],
	args: {
		placeholder: "Change status…",
		shortcut: "S",
		multi: false,
		onPick: fn(),
		rows: states.map((state, index) => ({
			id: state.id,
			label: state.name,
			icon: <LinearStateIcon state={state} />,
			hint: String(index + 1),
			checked: state.id === backlog.id,
		})),
	},
} satisfies Meta<typeof PickerList>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Filtered: Story = {
	play: async ({ canvas, userEvent }) => {
		await userEvent.type(canvas.getByPlaceholderText("Change status…"), "pro");
	},
};

export const NoMatch: Story = {
	play: async ({ canvas, userEvent }) => {
		await userEvent.type(canvas.getByPlaceholderText("Change status…"), "zzz");
	},
};

export const Sections: Story = {
	args: {
		rows: states.map((state, index) => ({
			id: state.id,
			label: state.name,
			icon: <LinearStateIcon state={state} />,
			detail: index === 0 ? "Default" : undefined,
			checked: false,
			section: index < 2 ? "Not started" : "Started and closed",
		})),
	},
};
