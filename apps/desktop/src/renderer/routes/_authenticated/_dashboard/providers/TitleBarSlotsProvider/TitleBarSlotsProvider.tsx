import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
} from "react";
import { createPortal } from "react-dom";

interface TitleBarSlots {
	main: HTMLElement | null;
	side: HTMLElement | null;
	mainClaims: number;
	setMain: (element: HTMLElement | null) => void;
	setSide: (element: HTMLElement | null) => void;
	claimMain: () => () => void;
	setSideWidth: (width: number | null) => void;
}

const TitleBarSlotsContext = createContext<TitleBarSlots | null>(null);
/** Changes every frame while the right pane slides, so only the title bar reads it. */
const TitleBarSideWidthContext = createContext<number | null>(null);

/** Lets a screen put its tab bars in the window's title bar instead of above its content. */
export function TitleBarSlotsProvider({ children }: { children: ReactNode }) {
	const [main, setMain] = useState<HTMLElement | null>(null);
	const [side, setSide] = useState<HTMLElement | null>(null);
	const [mainClaims, setMainClaims] = useState(0);
	const [sideWidth, setSideWidth] = useState<number | null>(null);
	const claimMain = useCallback(() => {
		setMainClaims((count) => count + 1);
		return () => setMainClaims((count) => count - 1);
	}, []);
	const slots = useMemo(
		() => ({
			main,
			side,
			mainClaims,
			setMain,
			setSide,
			claimMain,
			setSideWidth,
		}),
		[main, side, mainClaims, claimMain],
	);
	return (
		<TitleBarSlotsContext.Provider value={slots}>
			<TitleBarSideWidthContext.Provider value={sideWidth}>
				{children}
			</TitleBarSideWidthContext.Provider>
		</TitleBarSlotsContext.Provider>
	);
}

export function useTitleBarSlots(): TitleBarSlots {
	const slots = useContext(TitleBarSlotsContext);
	if (!slots) {
		throw new Error(
			"useTitleBarSlots must be used within TitleBarSlotsProvider",
		);
	}
	return slots;
}

/** True inside the redesigned shell, whose title bar keeps the window controls clear for everything below it. */
export function useIsInTitleBarShell(): boolean {
	return useContext(TitleBarSlotsContext) !== null;
}

/** From the right pane's left edge to the window's right edge, or null while the pane is closed. */
export function useTitleBarSideWidth(): number | null {
	return useContext(TitleBarSideWidthContext);
}

/**
 * The title bar element a screen's main tab bar renders into: undefined outside
 * the shell, so the bar stays inline, and null until the title bar has mounted.
 */
export function useTitleBarMainSlot(): HTMLElement | null | undefined {
	const slots = useContext(TitleBarSlotsContext);
	const claimMain = slots?.claimMain;
	useEffect(() => claimMain?.(), [claimMain]);
	return slots ? slots.main : undefined;
}

/** The title bar element above the right pane; `pane` is measured so the slot spans exactly what the pane shows. */
export function useTitleBarSideSlot(
	pane: HTMLElement | null,
): HTMLElement | null | undefined {
	const slots = useContext(TitleBarSlotsContext);
	const setSideWidth = slots?.setSideWidth;
	useEffect(() => {
		if (!pane || !setSideWidth) return;
		const measure = () => {
			const rect = pane.getBoundingClientRect();
			const isShown = rect.width > 0 && rect.left < window.innerWidth;
			setSideWidth(isShown ? window.innerWidth - rect.left : null);
		};
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(pane);
		window.addEventListener("resize", measure);
		return () => {
			observer.disconnect();
			window.removeEventListener("resize", measure);
			setSideWidth(null);
		};
	}, [pane, setSideWidth]);
	return slots ? slots.side : undefined;
}

/**
 * `Workspace` props that move its tab bar into a title bar slot; none outside
 * the shell. The moved bar keeps its `data-pane-area`, which close shortcuts
 * use to find the active area, and an `inert` bar is hidden.
 */
export function titleBarTabBarProps(
	slot: HTMLElement | null | undefined,
	{
		paneArea,
		inert = false,
	}: { paneArea: "center" | "right"; inert?: boolean },
): {
	tabBarClassName?: string;
	renderTabBar?: (tabBar: ReactNode) => ReactNode;
} {
	if (slot === undefined) return {};
	return {
		tabBarClassName: "h-full flex-1 shrink shadow-none",
		renderTabBar: (tabBar) =>
			slot
				? createPortal(
						<div
							data-pane-area={paneArea}
							inert={inert}
							className={inert ? "hidden" : "contents"}
						>
							{tabBar}
						</div>,
						slot,
					)
				: null,
	};
}
