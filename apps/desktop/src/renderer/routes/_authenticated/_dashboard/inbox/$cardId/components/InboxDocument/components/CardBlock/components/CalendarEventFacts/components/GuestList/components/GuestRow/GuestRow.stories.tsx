import type { Meta, StoryObj } from "@storybook/react-vite";
import { guests } from "../../../../../calendarFixtures";
import { GuestRow } from "./GuestRow";

const [organizer, , declined, optional, awaiting] = guests;

const meta = {
	component: GuestRow,
	decorators: [
		(Story) => (
			<ul>
				<Story />
			</ul>
		),
	],
	args: { guest: organizer },
} satisfies Meta<typeof GuestRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const OrganizerSaidYes: Story = {};

export const DeclinedWithNote: Story = { args: { guest: declined } };

export const OptionalMaybe: Story = { args: { guest: optional } };

/** No name from Google and no answer yet: the address, no badge. */
export const Awaiting: Story = { args: { guest: awaiting } };

export const ReaderWithPhoto: Story = {
	args: {
		guest: {
			...organizer,
			organizer: false,
			self: true,
			name: "Satya Patel",
			photo: "https://lh3.googleusercontent.com/a/default-user=s80",
		},
	},
};
