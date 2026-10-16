import type { Meta, StoryObj } from "@storybook/react-vite";
import { event, ownedEvent } from "../calendarFixtures";
import { CalendarEventFacts } from "./CalendarEventFacts";

const meta = {
	component: CalendarEventFacts,
	decorators: [
		(Story) => (
			<div className="-m-6 h-screen overflow-y-auto p-6">
				<div className="mx-auto max-w-3xl overflow-hidden rounded-lg border border-border bg-card">
					<Story />
				</div>
			</div>
		),
	],
	args: { event },
} satisfies Meta<typeof CalendarEventFacts>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Invitation: Story = {};

export const Owned: Story = { args: { event: ownedEvent } };

export const AllDay: Story = {
	args: {
		event: {
			...ownedEvent,
			title: "Offsite",
			allDay: true,
			start: "2037-10-06T00:00:00-07:00",
			end: "2037-10-09T00:00:00-07:00",
			meetUrl: null,
			description: null,
		},
	},
};

export const Cancelled: Story = {
	args: { event: { ...ownedEvent, cancelled: true } },
};

/** Only a title and a time. */
export const Bare: Story = {
	args: {
		event: {
			...ownedEvent,
			guests: [],
			meetUrl: null,
			description: null,
		},
	},
};
