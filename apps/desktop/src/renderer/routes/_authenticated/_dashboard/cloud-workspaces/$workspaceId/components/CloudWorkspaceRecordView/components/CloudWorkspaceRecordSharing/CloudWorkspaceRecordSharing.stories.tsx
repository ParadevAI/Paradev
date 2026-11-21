import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { CloudWorkspaceRecordSharing } from "./CloudWorkspaceRecordSharing";

const kiet = { userId: "kiet", name: "Kiet Ho", image: null };
const avi = { userId: "avi", name: "Avi Peltz", image: null };
const harshith = {
	userId: "harshith",
	name: "Harshith Mullapudi",
	image: null,
};
const satya = { userId: "satya", name: "Satya Patel", image: null };
const now = new Date("2026-09-26T12:00:00Z");
const ago = (minutes: number) => new Date(now.getTime() - minutes * 60_000);

const meta = {
	component: CloudWorkspaceRecordSharing,
	parameters: { layout: "fullscreen" },
	decorators: [
		(Story) => (
			<div className="flex w-full justify-end bg-background p-4">
				<Story />
			</div>
		),
	],
	args: {
		workspaceId: "ws-1",
		people: [
			{ ...avi, lastSeenAt: ago(3).getTime(), active: true },
			{ ...kiet, lastSeenAt: ago(1).getTime(), active: true },
			{ ...harshith, lastSeenAt: ago(2).getTime(), active: true },
			{ ...satya, lastSeenAt: ago(120).getTime(), active: false },
		],
		owner: satya,
		visibility: "org",
		canEditSharing: true,
		viewerId: "satya",
		now,
		onOpenPerson: fn(),
		onSetVisibility: fn(async () => {}),
	},
} satisfies Meta<typeof CloudWorkspaceRecordSharing>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SeveralPeople: Story = {};

export const OnePerson: Story = {
	args: { people: [{ ...avi, lastSeenAt: ago(1).getTime(), active: true }] },
};

export const OnlyYou: Story = {
	args: { visibility: "just_me", people: [] },
};
