import type { Meta, StoryObj } from "@storybook/react-vite";
import { LetterAvatar } from "./LetterAvatar";

const meta = {
	component: LetterAvatar,
	decorators: [
		(Story, { args }) => (
			<div className="flex items-center gap-4 text-[14px] font-bold">
				<Story />
				{args.address.name ?? args.address.email}
			</div>
		),
	],
	args: { address: { name: "Priya Raman", email: "priya.raman@northwind.co" } },
} satisfies Meta<typeof LetterAvatar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Named: Story = {};

export const AddressOnly: Story = {
	args: { address: { name: null, email: "no-reply@market.example.com" } },
};

export const Photo: Story = {
	args: { photo: "https://lh3.googleusercontent.com/a/default-user=s80" },
};

/** The photo fails to load: the letter takes its place. */
export const BrokenPhoto: Story = {
	args: { photo: "https://example.invalid/missing.png" },
};
