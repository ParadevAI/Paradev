import type { Meta, StoryObj } from "@storybook/react-vite";
import type { AccountColor } from "@superset/shared/account-colors";
import { useState } from "react";
import { AccountColorEditor } from "./AccountColorEditor";

const meta: Meta<typeof AccountColorEditor> = {
	title: "Accounts/AccountColorEditor",
	component: AccountColorEditor,
	args: { color: "green", dark: true, saving: false },
	parameters: { layout: "centered" },
	render: (args) => {
		const [color, setColor] = useState<AccountColor | null>(
			args.color as AccountColor | null,
		);
		return (
			<div className="w-64 rounded-lg border bg-popover p-3 text-popover-foreground">
				<AccountColorEditor {...args} color={color} onSave={setColor} />
			</div>
		);
	},
};
export default meta;
type Story = StoryObj<typeof meta>;
export const NamedColor: Story = {};
export const CustomColor: Story = { args: { color: "#c72d91" } };
export const Saving: Story = { args: { color: "#19a3b8", saving: true } };
