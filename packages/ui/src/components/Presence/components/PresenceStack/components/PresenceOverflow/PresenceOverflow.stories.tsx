import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { PresenceOverflow } from "./PresenceOverflow";

const now = new Date("2026-09-25T12:00:00Z");

const meta = {
	component: PresenceOverflow,
	decorators: [
		(Story) => (
			<div className="flex w-[320px] justify-end bg-background p-6">
				<Story />
			</div>
		),
	],
	args: {
		label: "+2",
		ariaLabel: "Show everyone who opened this workspace",
		now,
		onOpenPerson: fn(),
		people: [
			{
				userId: "kiet",
				name: "Kiet Ho",
				image: null,
				lastSeenAt: Date.parse("2026-09-25T11:55:00Z"),
				active: true,
			},
			{
				userId: "avi",
				name: "Avi Peltz",
				image: null,
				lastSeenAt: Date.parse("2026-09-24T12:00:00Z"),
				active: false,
			},
		],
	},
} satisfies Meta<typeof PresenceOverflow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const ManyPeople: Story = {
	args: {
		label: "+12",
		people: Array.from({ length: 12 }, (_, index) => ({
			userId: `person-${index}`,
			name: `Teammate ${index + 1}`,
			image: null,
			lastSeenAt: now.getTime() - index * 60 * 60 * 1000,
			active: index === 0,
		})),
	},
};
