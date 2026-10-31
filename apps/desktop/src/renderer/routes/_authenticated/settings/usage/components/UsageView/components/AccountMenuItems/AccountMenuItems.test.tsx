import { afterEach, describe, expect, mock, test } from "bun:test";

(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const { act, cleanup, fireEvent, render, within } = await import(
	"@testing-library/react"
);
const { DropdownMenu, DropdownMenuContent } = await import(
	"@superset/ui/dropdown-menu"
);
const { AccountMenuItems } = await import("./AccountMenuItems");

afterEach(cleanup);

async function menu({
	createdByParadev,
	removable = true,
}: {
	createdByParadev: boolean;
	removable?: boolean;
}) {
	const onRemove = mock(() => {});
	let view!: ReturnType<typeof render>;
	await act(async () => {
		view = render(
			<DropdownMenu open>
				<DropdownMenuContent>
					<AccountMenuItems
						onSwitchSignIn={() => {}}
						onRemove={removable ? onRemove : null}
						createdByParadev={createdByParadev}
					/>
				</DropdownMenuContent>
			</DropdownMenu>,
		);
	});
	const ui = within(view.baseElement as HTMLElement);
	const removeItem = () =>
		ui.queryByText("Remove…")?.closest("[role=menuitem]") ?? null;
	return { ui, onRemove, removeItem };
}

describe("a profile Paradev created", () => {
	test("can be removed", async () => {
		const { onRemove, removeItem } = await menu({ createdByParadev: true });
		const item = removeItem();
		expect(item?.getAttribute("data-disabled")).toBeNull();
		await act(async () => {
			fireEvent.click(item as Element);
		});
		expect(onRemove).toHaveBeenCalledTimes(1);
	});
});

// A profile from an earlier build, a dir the user made, or a host too old
// to say: Remove would delete nothing, so the menu says why up front.
describe("a profile Paradev did not create", () => {
	test("lists Remove as unavailable, with the reason", async () => {
		const { ui, removeItem } = await menu({ createdByParadev: false });
		expect(removeItem()?.getAttribute("data-disabled")).not.toBeNull();
		expect(
			ui.getByText("Paradev only removes profiles it created."),
		).toBeDefined();
	});
});

describe("the system-default login", () => {
	test("has no Remove", async () => {
		const { ui, removeItem } = await menu({
			createdByParadev: false,
			removable: false,
		});
		expect(removeItem()).toBeNull();
		expect(ui.getByText("Switch sign-in…")).toBeDefined();
	});
});
