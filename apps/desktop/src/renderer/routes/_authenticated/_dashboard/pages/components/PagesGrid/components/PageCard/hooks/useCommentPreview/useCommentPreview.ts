import {
	type FocusEvent,
	type KeyboardEvent,
	type MouseEvent,
	type PointerEvent,
	type RefObject,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";

/** Pointer has to rest on the count before the panel opens. */
const HOVER_INTENT_MS = 180;
/** How long the pointer may spend travelling from the count up onto the panel. */
const HOVER_GRACE_MS = 300;

export interface CommentPreviewTrigger {
	open: boolean;
	cardRef: RefObject<HTMLDivElement | null>;
	countRef: RefObject<HTMLAnchorElement | null>;
	cardProps: {
		onPointerLeave: (event: PointerEvent) => void;
		onKeyDown: (event: KeyboardEvent) => void;
		onBlur: (event: FocusEvent<HTMLDivElement>) => void;
	};
	countProps: {
		onPointerEnter: (event: PointerEvent) => void;
		onPointerLeave: (event: PointerEvent) => void;
		onFocus: (event: FocusEvent) => void;
		onClick: (event: MouseEvent) => void;
	};
	panelProps: {
		onPointerEnter: (event: PointerEvent) => void;
		onPointerLeave: (event: PointerEvent) => void;
		onFocus: (event: FocusEvent) => void;
	};
}

/**
 * The comment count is the trigger and the preview panel is its target:
 * hover opens after a short intent delay and survives the trip onto the
 * panel, keyboard focus opens immediately, Esc closes and hands focus back,
 * and on touch the first tap opens while the next one follows the link.
 */
export function useCommentPreview({
	eligible,
}: {
	/** Whether there is a comment to preview; without one the count never opens. */
	eligible: boolean;
}): CommentPreviewTrigger {
	const [open, setOpen] = useState(false);
	const cardRef = useRef<HTMLDivElement | null>(null);
	const countRef = useRef<HTMLAnchorElement | null>(null);
	const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const suppressFocusOpen = useRef(false);
	// While the count or the panel holds keyboard focus, the pointer leaving
	// must not hide the panel: that would leave focus on an invisible link.
	const keyboardFocus = useRef(false);
	const touchOnly = useMemo(
		() => window.matchMedia("(hover: none)").matches,
		[],
	);

	const cancelOpenTimer = useCallback(() => {
		if (openTimer.current !== null) clearTimeout(openTimer.current);
		openTimer.current = null;
	}, []);
	const cancelCloseTimer = useCallback(() => {
		if (closeTimer.current !== null) clearTimeout(closeTimer.current);
		closeTimer.current = null;
	}, []);

	const openNow = useCallback(() => {
		cancelOpenTimer();
		cancelCloseTimer();
		if (eligible) setOpen(true);
	}, [cancelCloseTimer, cancelOpenTimer, eligible]);

	const closeNow = useCallback(() => {
		cancelOpenTimer();
		cancelCloseTimer();
		setOpen(false);
	}, [cancelCloseTimer, cancelOpenTimer]);

	const scheduleClose = useCallback(() => {
		cancelCloseTimer();
		closeTimer.current = setTimeout(() => setOpen(false), HOVER_GRACE_MS);
	}, [cancelCloseTimer]);

	useEffect(() => () => closeNow(), [closeNow]);

	// A click or tap anywhere outside the card closes the panel.
	useEffect(() => {
		if (!open) return;
		const onPointerDown = (event: globalThis.PointerEvent) => {
			const card = cardRef.current;
			if (card && event.target instanceof Node && !card.contains(event.target))
				closeNow();
		};
		document.addEventListener("pointerdown", onPointerDown);
		return () => document.removeEventListener("pointerdown", onPointerDown);
	}, [open, closeNow]);

	const onTriggerFocus = (event: FocusEvent) => {
		if (suppressFocusOpen.current) return;
		// Only keyboard focus opens; a mouse press on the link should navigate
		// without flashing the panel first, and a tap is handled by onClick.
		let keyboard = true;
		try {
			keyboard = event.target.matches(":focus-visible");
		} catch {}
		if (!keyboard) return;
		keyboardFocus.current = true;
		openNow();
	};

	const isTrigger = (node: EventTarget | null) =>
		node instanceof HTMLElement &&
		(node === countRef.current ||
			node.id === countRef.current?.getAttribute("aria-describedby"));

	return {
		open,
		cardRef,
		countRef,
		cardProps: {
			onPointerLeave: (event) => {
				if (event.pointerType === "touch" || keyboardFocus.current) return;
				closeNow();
			},
			onKeyDown: (event) => {
				if (event.key !== "Escape" || !open) return;
				event.preventDefault();
				keyboardFocus.current = false;
				closeNow();
				suppressFocusOpen.current = true;
				countRef.current?.focus();
				suppressFocusOpen.current = false;
			},
			onBlur: (event) => {
				const next = event.relatedTarget;
				if (isTrigger(next)) return;
				const wasKeyboard = keyboardFocus.current;
				keyboardFocus.current = false;
				if (
					wasKeyboard ||
					!(next instanceof Node) ||
					!event.currentTarget.contains(next)
				)
					closeNow();
			},
		},
		countProps: {
			onPointerEnter: (event) => {
				if (event.pointerType === "touch") return;
				cancelCloseTimer();
				if (!open && eligible) {
					cancelOpenTimer();
					openTimer.current = setTimeout(() => setOpen(true), HOVER_INTENT_MS);
				}
			},
			onPointerLeave: (event) => {
				if (event.pointerType === "touch") return;
				cancelOpenTimer();
				if (open && !keyboardFocus.current) scheduleClose();
			},
			onFocus: onTriggerFocus,
			onClick: (event) => {
				if (touchOnly && eligible && !open) {
					event.preventDefault();
					openNow();
				}
			},
		},
		panelProps: {
			onPointerEnter: (event) => {
				if (event.pointerType === "touch") return;
				cancelCloseTimer();
			},
			onPointerLeave: (event) => {
				if (event.pointerType === "touch") return;
				if (open && !keyboardFocus.current) scheduleClose();
			},
			onFocus: onTriggerFocus,
		},
	};
}
