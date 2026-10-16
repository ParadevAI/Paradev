import { GlobalRegistrator } from "@happy-dom/global-registrator";
import type { ComponentType } from "react";
import type { CardAction, CardInput } from "../types";

interface BlockProps<View> {
	view: View;
	actions: CardAction[];
	done: boolean;
	pending: boolean;
	failure: string | null;
	onAct: (actionId: string, input?: CardInput) => void;
}

/** What the headless Stripe block tests share: a DOM, a clock fixed at noon on Oct 1, 2037 (Pacific), and a mounted block with the moves a reader makes. */
export async function stripeTestKit() {
	const alreadyRegistered = GlobalRegistrator.isRegistered;
	if (!alreadyRegistered) GlobalRegistrator.register();
	(
		globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
	).IS_REACT_ACT_ENVIRONMENT = true;
	const { afterAll, afterEach, mock, setSystemTime } = await import("bun:test");
	setSystemTime(new Date("2037-10-01T19:00:00Z"));
	const { act, cleanup, fireEvent, render } = await import(
		"@testing-library/react"
	);
	const { TooltipProvider } = await import("@superset/ui/tooltip");

	afterEach(cleanup);
	afterAll(async () => {
		setSystemTime();
		if (!alreadyRegistered) await GlobalRegistrator.unregister();
	});

	function mount<View>(
		Block: ComponentType<BlockProps<View>>,
		props: Pick<BlockProps<View>, "view" | "actions"> &
			Partial<BlockProps<View>>,
	) {
		const onAct = mock();
		const view = render(
			<TooltipProvider>
				<Block
					done={false}
					pending={false}
					failure={null}
					onAct={onAct}
					{...props}
				/>
			</TooltipProvider>,
		);
		const button = (name: string | RegExp) =>
			view.getByRole("button", { name }) as HTMLButtonElement;
		const click = (name: string | RegExp) =>
			act(async () => {
				fireEvent.click(button(name));
			});
		const question = () =>
			document.body.querySelector(
				"[role='alertdialog'] [data-slot='alert-dialog-description']",
			)?.textContent ?? null;
		const confirm = () =>
			act(async () => {
				fireEvent.click(
					document.body.querySelector(
						"[role='alertdialog'] [data-slot='alert-dialog-action']",
					) as HTMLElement,
				);
			});
		const type = (label: string, value: string) =>
			act(async () => {
				fireEvent.change(view.getByLabelText(label), { target: { value } });
			});
		const choose = (name: string | RegExp) =>
			act(async () => {
				fireEvent.click(view.getByRole("radio", { name }));
			});
		const pickDay = async (label: string, day: RegExp) => {
			await act(async () => {
				// A popover that just closed swallows a click made in the same tick.
				await new Promise((resolve) => setTimeout(resolve, 50));
				fireEvent.click(button(label));
			});
			await act(async () => {
				fireEvent.click(view.getByRole("button", { name: day }));
			});
		};
		return {
			...view,
			onAct,
			button,
			click,
			question,
			confirm,
			type,
			choose,
			pickDay,
		};
	}

	return { act, cleanup, fireEvent, render, mount, TooltipProvider };
}
