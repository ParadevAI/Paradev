import { useLingui } from "@lingui/react/macro";
import { QUOTED_REPLY_MAX_CHARS } from "@superset/chat/core";
import { formatNumber } from "@superset/i18n/format";
import { toast } from "@superset/ui/sonner";
import {
	type MouseEvent,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import {
	type ReplySelection,
	readReplySelection,
} from "../../utils/replySelection";
import { type Box, intersectBoxes } from "../../utils/selectionToolbarLayout";

export type ShownReplySelection = ReplySelection & { bounds: Box };

function readShown(viewport: HTMLElement): ShownReplySelection | null {
	const selection = readReplySelection(window.getSelection(), viewport);
	if (!selection) return null;
	const bounds = intersectBoxes(viewport.getBoundingClientRect(), {
		left: 0,
		top: 0,
		right: window.innerWidth,
		bottom: window.innerHeight,
	});
	const { anchor } = selection;
	return anchor.bottom > bounds.top && anchor.top < bounds.bottom
		? { ...selection, bounds }
		: null;
}

function sameQuote(a: ReplySelection | null, b: ReplySelection): boolean {
	return a?.replyId === b.replyId && a.text === b.text;
}

/**
 * The text picked in a reply, offered to the composer until the reader
 * presses elsewhere, scrolls by hand, presses Escape or opens another chat.
 */
export function useReplySelection({
	viewport,
	resetKey,
	enabled,
}: {
	viewport: HTMLElement | null;
	resetKey: string;
	enabled: boolean;
}) {
	const { t } = useLingui();
	const [shown, setShown] = useState<{
		key: string;
		selection: ShownReplySelection;
	} | null>(null);
	if (shown && shown.key !== resetKey) setShown(null);
	const selection = enabled && shown?.key === resetKey ? shown.selection : null;
	const selectionRef = useRef(selection);
	selectionRef.current = selection;
	const toolbarRef = useRef<HTMLDivElement>(null);
	const dismiss = useCallback(() => setShown(null), []);
	const isShown = selection !== null;

	const onMouseUp = useCallback(
		(event: MouseEvent) => {
			if (!enabled || !viewport || event.button !== 0) return;
			requestAnimationFrame(() => {
				const next = readShown(viewport);
				setShown(next ? { key: resetKey, selection: next } : null);
			});
		},
		[enabled, viewport, resetKey],
	);

	useEffect(() => {
		if (!isShown || !viewport) return;
		const close = () => setShown(null);
		let frame = 0;
		const follow = () => {
			cancelAnimationFrame(frame);
			frame = requestAnimationFrame(() => {
				const current = selectionRef.current;
				const next = readShown(viewport);
				if (!current || !next || !sameQuote(next, current)) close();
				else setShown({ key: resetKey, selection: next });
			});
		};
		const onPointerDown = (event: PointerEvent) => {
			if (
				event.target instanceof Node &&
				toolbarRef.current?.contains(event.target)
			)
				return;
			close();
		};
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key !== "Escape") return;
			event.preventDefault();
			event.stopPropagation();
			close();
		};
		const onSelectionChange = () => {
			const current = selectionRef.current;
			if (
				!current ||
				!sameQuote(readReplySelection(window.getSelection(), viewport), current)
			)
				close();
		};
		window.addEventListener("pointerdown", onPointerDown, true);
		window.addEventListener("keydown", onKeyDown, true);
		window.addEventListener("resize", close);
		viewport.addEventListener("wheel", close, { passive: true });
		viewport.addEventListener("touchmove", close, { passive: true });
		viewport.addEventListener("scroll", follow, { passive: true });
		document.addEventListener("selectionchange", onSelectionChange);
		return () => {
			cancelAnimationFrame(frame);
			window.removeEventListener("pointerdown", onPointerDown, true);
			window.removeEventListener("keydown", onKeyDown, true);
			window.removeEventListener("resize", close);
			viewport.removeEventListener("wheel", close);
			viewport.removeEventListener("touchmove", close);
			viewport.removeEventListener("scroll", follow);
			document.removeEventListener("selectionchange", onSelectionChange);
		};
	}, [isShown, viewport, resetKey]);

	const commit = useCallback(
		(action: (text: string) => void) => {
			const current = selectionRef.current;
			if (!current) return;
			setShown(null);
			if (current.text.length > QUOTED_REPLY_MAX_CHARS) {
				const limit = formatNumber(QUOTED_REPLY_MAX_CHARS);
				toast.warning(
					t({ message: `A quote can be up to ${limit} characters` }),
				);
				return;
			}
			window.getSelection()?.removeAllRanges();
			action(current.text);
		},
		[t],
	);

	return { selection, toolbarRef, onMouseUp, commit, dismiss };
}
