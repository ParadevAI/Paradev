import type { Meta, StoryObj } from "@storybook/react-vite";
import {
	createMemoryHistory,
	createRootRoute,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";
import { fn, userEvent, within } from "storybook/test";
import { TurnFailureActionsProvider } from "../../../../../../../../providers/TurnFailureActionsProvider";
import { TurnFailureCard } from "./TurnFailureCard";

const meta = {
	component: TurnFailureCard,
	decorators: [
		(Story) => (
			<TurnFailureActionsProvider
				value={{
					blocked: false,
					continueTask: fn(),
					changeModel: fn(),
					dismissed: new Set(),
					setDismissed: fn(),
				}}
			>
				<RouterProvider
					router={createRouter({
						history: createMemoryHistory(),
						routeTree: createRootRoute({
							component: () => (
								<div className="w-[40rem]">
									<Story />
								</div>
							),
						}),
					})}
				/>
			</TurnFailureActionsProvider>
		),
	],
	args: { latest: true, turnId: "t1", error: undefined },
} satisfies Meta<typeof TurnFailureCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SpendLimit: Story = {
	args: {
		error: {
			message:
				'API Error: 400 {"type":"error","error":{"type":"invalid_request_error","message":"You have reached your specified workspace API usage limits. You will regain access on 2026-12-01 at 00:00 UTC."}}',
		},
	},
};

export const SpendLimitDetails: Story = {
	args: SpendLimit.args,
	play: async ({ canvasElement }) => {
		await userEvent.click(within(canvasElement).getByText("Show details"));
	},
};

export const Crashed: Story = {
	args: {
		error: {
			kind: "crashed",
			message: "acp agent exited (code 1)",
			detail: "Segmentation fault",
		},
	},
};
