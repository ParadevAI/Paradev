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
	contentCard: HTMLElement | null;
	mainClaims: number;
	setMain: (element: HTMLElement | null) => void;
	setSide: (element: HTMLElement | null) => void;
	setContentCard: (element: HTMLElement | null) => void;
	claimMain: () => () => void;
	setSideWidth: (width: number | null, layoutWidth?: number | null) => void;
}

const TitleBarSlotsContext = createContext<TitleBarSlots | null>(null);
interface TitleBarSide {
	/** From the right pane's left edge to the window's right edge, or null while the pane is closed. */
	width: number | null;
	/** The same span for the pane at rest, while the pane slides; null when it is still. */
	layoutWidth: number | null;
}

const CLOSED_SIDE: TitleBarSide = { width: null, layoutWidth: null };
/** Changes every frame while the right pane slides, so only the title bar reads it. */
const TitleBarSideContext = createContext<TitleBarSide>(CLOSED_SIDE);

/** Lets a screen put its tab bars in the window's title bar instead of above its content. */
export function TitleBarSlotsProvider({ children }: { children: ReactNode }) {
	const [main, setMain] = useState<HTMLElement | null>(null);
	const [sideSlot, setSide] = useState<HTMLElement | null>(null);
	const [contentCard, setContentCard] = useState<HTMLElement | null>(null);
	const [mainClaims, setMainClaims] = useState(0);
	const [side, setSideState] = useState(CLOSED_SIDE);
	const setSideWidth = useCallback(
		(width: number | null, layoutWidth: number | null = null) =>
			setSideState((current) =>
				current.width === width && current.layoutWidth === layoutWidth
					? current
					: { width, layoutWidth },
			),
		[],
	);
	const claimMain = useCallback(() => {
		setMainClaims((count) => count + 1);
		return () => setMainClaims((count) => count - 1);
	}, []);
	const slots = useMemo(
		() => ({
			main,
			side: sideSlot,
			contentCard,
			mainClaims,
			setMain,
			setSide,
			setContentCard,
			claimMain,
			setSideWidth,
		}),
		[main, sideSlot, contentCard, mainClaims, claimMain, setSideWidth],
	);
	return (
		<TitleBarSlotsContext.Provider value={slots}>
			<TitleBarSideContext.Provider value={side}>
				{children}
			</TitleBarSideContext.Provider>
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

export function useTitleBarSide(): TitleBarSide {
	return useContext(TitleBarSideContext);
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
			if (!isShown) {
				setSideWidth(null);
				return;
			}
			const content = pane.hasAttribute("data-moving")
				? pane.firstElementChild?.firstElementChild
				: null;
			setSideWidth(
				window.innerWidth - rect.left,
				content
					? content.getBoundingClientRect().width +
							window.innerWidth -
							rect.right
					: null,
			);
		};
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(pane);
		const moveObserver = new MutationObserver(measure);
		moveObserver.observe(pane, {
			attributes: true,
			attributeFilter: ["data-moving"],
		});
		window.addEventListener("resize", measure);
		return () => {
			observer.disconnect();
			moveObserver.disconnect();
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
