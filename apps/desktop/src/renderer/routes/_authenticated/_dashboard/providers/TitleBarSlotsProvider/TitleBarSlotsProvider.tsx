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
	/** From the right pane's left edge to the window's right edge, or null while it is closed. */
	sideWidth: number | null;
	setMain: (element: HTMLElement | null) => void;
	setSide: (element: HTMLElement | null) => void;
	claimMain: () => () => void;
	setSideWidth: (width: number | null) => void;
}

const TitleBarSlotsContext = createContext<TitleBarSlots | null>(null);

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
	const value = useMemo(
		() => ({
			main,
			side,
			mainClaims,
			sideWidth,
			setMain,
			setSide,
			claimMain,
			setSideWidth,
		}),
		[main, side, mainClaims, sideWidth, claimMain],
	);
	return (
		<TitleBarSlotsContext.Provider value={value}>
			{children}
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

/** The title bar element above the right pane; `pane` is measured so the slot starts where the pane does. */
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

/** `Workspace` props that move its tab bar into a title bar slot; none outside the shell. */
export function titleBarTabBarProps(slot: HTMLElement | null | undefined): {
	tabBarClassName?: string;
	renderTabBar?: (tabBar: ReactNode) => ReactNode;
} {
	if (slot === undefined) return {};
	return {
		tabBarClassName: "h-full flex-1 shrink shadow-none",
		renderTabBar: (tabBar) => (slot ? createPortal(tabBar, slot) : null),
	};
}
