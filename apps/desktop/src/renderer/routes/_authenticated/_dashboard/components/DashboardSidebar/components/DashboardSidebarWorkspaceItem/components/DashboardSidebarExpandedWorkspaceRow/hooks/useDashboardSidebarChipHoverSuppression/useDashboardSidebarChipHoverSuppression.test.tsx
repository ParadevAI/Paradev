import { afterEach, describe, expect, it } from "bun:test";
import type { ReactNode } from "react";

(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const { act, cleanup, renderHook } = await import("@testing-library/react");
const { DashboardSidebarHoverProvider, useDashboardSidebarHover } =
	await import(
		"renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/providers/DashboardSidebarHoverProvider"
	);
const { useDashboardSidebarChipHoverSuppression } = await import(
	"./useDashboardSidebarChipHoverSuppression"
);

afterEach(cleanup);

function wrapper({ children }: { children: ReactNode }) {
	return (
		<DashboardSidebarHoverProvider>{children}</DashboardSidebarHoverProvider>
	);
}

function render(suppressWorkspaceCardOn: "hover" | "open") {
	return renderHook(
		() => ({
			chip: useDashboardSidebarChipHoverSuppression({
				suppressWorkspaceCardOn,
			}),
			suppressed: useDashboardSidebarHover().hoverCardSuppressed,
		}),
		{ wrapper },
	);
}

describe("useDashboardSidebarChipHoverSuppression", () => {
	it("holds the workspace card from pointer enter by default", () => {
		const { result } = render("hover");
		act(() => result.current.chip.onPointerEnter());
		expect(result.current.suppressed).toBe(true);
		act(() => result.current.chip.onPointerLeave());
		expect(result.current.suppressed).toBe(false);
	});

	it("with suppressWorkspaceCardOn: open, holds only while the chip card is open", () => {
		const { result } = render("open");
		act(() => result.current.chip.onPointerEnter());
		expect(result.current.suppressed).toBe(false);
		act(() => result.current.chip.onOpenChange(true));
		expect(result.current.suppressed).toBe(true);
		act(() => result.current.chip.onPointerLeave());
		expect(result.current.suppressed).toBe(true);
		act(() => result.current.chip.onOpenChange(false));
		expect(result.current.suppressed).toBe(false);
	});
});
