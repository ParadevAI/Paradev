import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import type { GmailAddress } from "../../types";
import { RecipientField } from "./RecipientField";

const known: GmailAddress[] = [
	{ name: "Avery Kim", email: "avery@example.com" },
	{ name: "Blake Lee", email: "blake@example.com" },
	{ name: null, email: "casey@example.com" },
];

function Field({ initial }: { initial: GmailAddress[] }) {
	const [value, setValue] = useState(initial);
	return (
		<RecipientField
			label="To"
			value={value}
			onChange={setValue}
			known={known}
		/>
	);
}

const meta = {
	component: Field,
	decorators: [
		(Story) => (
			<div className="mx-auto max-w-xl rounded-lg border border-border bg-background">
				<Story />
			</div>
		),
	],
	args: { initial: [known[0] as GmailAddress] },
} satisfies Meta<typeof Field>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Type an address and press Enter, comma or Tab; paste several at once; Backspace takes the last chip back. */
export const Default: Story = {};

export const Empty: Story = {
	args: { initial: [] },
};

export const ManyRecipients: Story = {
	args: {
		initial: Array.from({ length: 14 }, (_, i) => ({
			name: `Person ${i + 1}`,
			email: `p${i + 1}@example.com`,
		})),
	},
};
