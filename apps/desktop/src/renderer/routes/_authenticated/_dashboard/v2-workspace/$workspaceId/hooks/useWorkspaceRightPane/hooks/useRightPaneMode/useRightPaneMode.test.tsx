import { afterEach, describe, expect, test } from "bun:test";

(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const { act, cleanup, renderHook } = await import("@testing-library/react");
const { useRightPaneMode } = await import("./useRightPaneMode");

afterEach(cleanup);

function renderMode({
	isOpen,
	canExpand = true,
}: {
	isOpen: boolean;
	canExpand?: boolean;
}) {
	const props = { workspaceId: "ws-1", isOpen, canExpand };
	const hook = renderHook(
		(current: typeof props) =>
			useRightPaneMode({
				...current,
				setOpen: (open) => {
					props.isOpen = open;
				},
			}),
		{ initialProps: props },
	);
	return {
		mode: () => hook.result.current.mode,
		toggle: () => {
			act(() => hook.result.current.toggleFullScreen());
			hook.rerender({ ...props });
		},
		setOpen: (open: boolean) => {
			props.isOpen = open;
			hook.rerender({ ...props });
		},
		switchWorkspace: (workspaceId: string) => {
			props.workspaceId = workspaceId;
			hook.rerender({ ...props });
		},
	};
}

describe("useRightPaneMode", () => {
	test("full screen from closed opens the pane, and exit closes it again", () => {
		const pane = renderMode({ isOpen: false });
		expect(pane.mode()).toBe("closed");
		pane.toggle();
		expect(pane.mode()).toBe("expanded");
		pane.toggle();
		expect(pane.mode()).toBe("closed");
		pane.setOpen(true);
		expect(pane.mode()).toBe("open");
	});

	test("full screen from open returns to open", () => {
		const pane = renderMode({ isOpen: true });
		pane.toggle();
		expect(pane.mode()).toBe("expanded");
		pane.toggle();
		expect(pane.mode()).toBe("open");
	});

	test("closing while expanded drops full screen", () => {
		const pane = renderMode({ isOpen: true });
		pane.toggle();
		pane.setOpen(false);
		expect(pane.mode()).toBe("closed");
		pane.setOpen(true);
		expect(pane.mode()).toBe("open");
	});

	test("full screen belongs to the workspace that entered it", () => {
		const pane = renderMode({ isOpen: true });
		pane.toggle();
		pane.switchWorkspace("ws-2");
		expect(pane.mode()).toBe("open");
		pane.switchWorkspace("ws-1");
		expect(pane.mode()).toBe("expanded");
	});

	test("never expands when expanding is not allowed", () => {
		const pane = renderMode({ isOpen: true, canExpand: false });
		pane.toggle();
		expect(pane.mode()).toBe("open");
	});
});
