import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { lena, marcus, riya } from "../linearFixtures";
import { LinearComposer } from "./LinearComposer";

const meta = {
	component: LinearComposer,
	decorators: [
		(Story) => (
			<div className="mx-auto max-w-2xl rounded-lg border border-border bg-card p-3">
				<Story />
			</div>
		),
	],
	args: {
		value: "",
		placeholder: "Leave a reply…",
		mentionable: [lena, marcus, riya],
		onChange: fn(),
		onSubmit: fn(),
	},
} satisfies Meta<typeof LinearComposer>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {};

/** The agent's draft, with every kind of formatting the box takes. */
export const Draft: Story = {
	args: {
		value:
			'Lazy restore **works** for me, and it is *fast*.\n\n- first paint: ~14 s\n- input: blocked for a second\n\n- [ ] Try it on iPad\n\n> Can we show the shell first?\n\n```\nawait attach({ restore: "lazy" })\n```\n\nSee [the trace](https://example.com/trace).',
	},
};

export const Disabled: Story = {
	args: { value: "Sending this now.", disabled: true },
};
