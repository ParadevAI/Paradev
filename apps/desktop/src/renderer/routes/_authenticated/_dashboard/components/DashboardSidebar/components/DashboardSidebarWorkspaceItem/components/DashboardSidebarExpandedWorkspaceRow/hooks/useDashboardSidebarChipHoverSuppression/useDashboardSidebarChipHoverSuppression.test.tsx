import { afterEach, describe, expect, it } from "bun:test";
import type { ReactNode } from "react";

(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const {
	act,
	cleanup,
	render: renderTree,
	renderHook,
} = await import("@testing-library/react");
const { DashboardSidebarHoverProvider, useDashboardSidebarHover } =
	await import(
		"renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/providers/DashboardSidebarHoverProvider"
	);
const { useDashboardSidebarChipHoverSuppression } = await import(
	"./useDashboardSidebarChipHoverSuppression"
);

type ChipApi = ReturnType<typeof useDashboardSidebarChipHoverSuppression>;

afterEach(cleanup);

function wrapper({ children }: { children: ReactNode }) {
	return (
		<DashboardSidebarHoverProvider>{children}</DashboardSidebarHoverProvider>
	);
}

function render() {
	return renderHook(
		() => ({
			chip: useDashboardSidebarChipHoverSuppression(),
			suppressed: useDashboardSidebarHover().hoverCardSuppressed,
		}),
		{ wrapper },
	);
}

describe("useDashboardSidebarChipHoverSuppression", () => {
	it("holds the workspace card only while the chip card is open", () => {
		const { result } = render();
		expect(result.current.suppressed).toBe(false);
		act(() => result.current.chip.onOpenChange(true));
		expect(result.current.suppressed).toBe(true);
		act(() => result.current.chip.onPointerLeave());
		expect(result.current.suppressed).toBe(true);
		act(() => result.current.chip.onOpenChange(false));
		expect(result.current.suppressed).toBe(false);
	});

	it("releases an open chip's hold when the chip unmounts", () => {
		const chip: { current: ChipApi | null } = { current: null };
		const hover: { current: boolean | null } = { current: null };
		function Chip() {
			chip.current = useDashboardSidebarChipHoverSuppression();
			return null;
		}
		function HoverState() {
			hover.current = useDashboardSidebarHover().hoverCardSuppressed;
			return null;
		}
		const tree = (mounted: boolean) => (
			<DashboardSidebarHoverProvider>
				<HoverState />
				{mounted && <Chip />}
			</DashboardSidebarHoverProvider>
		);
		const { rerender } = renderTree(tree(true));
		act(() => chip.current?.onOpenChange(true));
		expect(hover.current).toBe(true);
		rerender(tree(false));
		expect(hover.current).toBe(false);
	});
});
