import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { LinearStateIcon } from "../LinearStateIcon";
import { backlog, states, todo } from "../linearFixtures";
import { type FieldMenu, FieldPicker } from "./FieldPicker";

const face = (state: typeof backlog) => ({
	icon: <LinearStateIcon state={state} />,
	text: state.name,
	empty: false,
});

const model: FieldMenu = {
	key: "state",
	name: "Status",
	placeholder: "Change status…",
	shortcut: "S",
	multi: false,
	rows: states.map((state, index) => ({
		id: state.id,
		label: state.name,
		icon: <LinearStateIcon state={state} />,
		hint: String(index + 1),
		checked: state.id === todo.id,
	})),
};

const meta = {
	component: FieldPicker,
	args: {
		model,
		face: face(todo),
		open: false,
		onOpenChange: fn(),
		onPick: fn(),
	},
} satisfies Meta<typeof FieldPicker>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Open: Story = { args: { open: true } };
export const Changed: Story = { args: { was: face(backlog) } };
export const Disabled: Story = { args: { disabled: true } };
