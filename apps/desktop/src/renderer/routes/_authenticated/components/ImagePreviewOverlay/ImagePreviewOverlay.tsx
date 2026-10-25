import { useLingui } from "@lingui/react/macro";
import { toast } from "@superset/ui/sonner";
import { Spinner } from "@superset/ui/spinner";
import { cn } from "@superset/ui/utils";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
	CheckIcon,
	ChevronLeftIcon,
	ChevronRightIcon,
	CircleCheckIcon,
	CopyIcon,
	DownloadIcon,
	XIcon,
} from "lucide-react";
import {
	type KeyboardEvent as ReactKeyboardEvent,
	type ReactNode,
	useEffect,
	useRef,
	useState,
} from "react";
import { createPortal } from "react-dom";
import { PR_GREEN_FILL_CLASS_NAME } from "renderer/routes/_authenticated/_dashboard/pull-requests/components/pull-request-colors";

interface ImagePreviewOverlayProps {
	/** Null while the bytes load; `fallback` or a spinner shows in its place. */
	src: string | null;
	filename: string;
	open: boolean;
	onClose: () => void;
	onDownload: () => Promise<void>;
	fallback?: ReactNode;
	onCopy?: (() => Promise<void>) | undefined;
	onPrevious?: (() => void) | undefined;
	onNext?: (() => void) | undefined;
	/** The image's place in a sequence; the step buttons and count show only with more than one. */
	position?: { index: number; total: number } | undefined;
	/** Takes focus when the overlay closes; otherwise the element focused when it opened. */
	focusOnClose?: (() => HTMLElement | null | undefined) | undefined;
}

const SCRIM_BUTTON_CLASS =
	"flex cursor-pointer items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 active:bg-white/25 disabled:cursor-default disabled:opacity-40 disabled:hover:bg-white/10";
const CORNER_BUTTON_CLASS = cn(SCRIM_BUTTON_CLASS, "size-10");
const EDGE_BUTTON_CLASS = cn(
	SCRIM_BUTTON_CLASS,
	"-translate-y-1/2 absolute top-1/2 size-12",
);
const COPIED_MS = 1500;

function selectionInside(container: HTMLElement | null): boolean {
	const selection = window.getSelection();
	if (!container || !selection || selection.isCollapsed) return false;
	return container.contains(selection.anchorNode);
}

/**
 * Full-screen image preview: dark scrim, centered image, floating buttons in
 * the top-right corner. Escape or a scrim click closes; Left and Right step
 * through a sequence; ⌘C copies the image unless text in the overlay is selected.
 */
export function ImagePreviewOverlay({
	src,
	filename,
	open,
	onClose,
	onDownload,
	fallback,
	onCopy,
	onPrevious,
	onNext,
	position,
	focusOnClose,
}: ImagePreviewOverlayProps) {
	const { t } = useLingui();
	const reduceMotion = useReducedMotion();
	const [isSaving, setIsSaving] = useState(false);
	const [copyCount, setCopyCount] = useState(0);
	const [copiedSrc, setCopiedSrc] = useState<string | null>(null);
	const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const dialogRef = useRef<HTMLDivElement>(null);
	const openerRef = useRef<HTMLElement | null>(null);
	const focusOnCloseRef = useRef(focusOnClose);
	focusOnCloseRef.current = focusOnClose;

	const inSequence = position !== undefined && position.total > 1;
	const [brokenSrc, setBrokenSrc] = useState<string | null>(null);
	const shownSrc = src !== null && src !== brokenSrc ? src : null;
	const copied = shownSrc !== null && copiedSrc === shownSrc;

	const handleCopy = async () => {
		if (!onCopy) return;
		try {
			await onCopy();
			setCopiedSrc(src);
			setCopyCount((count) => count + 1);
			toast.success(t({ message: "Image copied" }), {
				icon: (
					<CircleCheckIcon
						className={cn("size-4 text-background", PR_GREEN_FILL_CLASS_NAME)}
					/>
				),
			});
			if (copiedTimer.current) clearTimeout(copiedTimer.current);
			copiedTimer.current = setTimeout(() => setCopiedSrc(null), COPIED_MS);
		} catch {
			toast.error(t({ message: "Couldn't copy the image" }));
		}
	};
	useEffect(
		() => () => {
			if (copiedTimer.current) clearTimeout(copiedTimer.current);
		},
		[],
	);

	const keysRef = useRef({ onClose, onPrevious, onNext, handleCopy });
	keysRef.current = { onClose, onPrevious, onNext, handleCopy };
	const stepsRef = useRef({ inSequence, canCopy: Boolean(onCopy) });
	stepsRef.current = { inSequence, canCopy: Boolean(onCopy) };
	useEffect(() => {
		if (!open) return;
		const handler = (event: KeyboardEvent) => {
			const keys = keysRef.current;
			const steps = stepsRef.current;
			if (event.key === "Escape") {
				event.stopPropagation();
				keys.onClose();
				return;
			}
			if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
				event.stopPropagation();
				event.preventDefault();
				if (!steps.inSequence) return;
				if (event.key === "ArrowLeft") keys.onPrevious?.();
				else keys.onNext?.();
				return;
			}
		};
		// ⌘C reaches the page as the Edit menu's Copy command, not always as a keydown.
		const copyHandler = (event: ClipboardEvent) => {
			if (!stepsRef.current.canCopy || selectionInside(dialogRef.current))
				return;
			event.preventDefault();
			void keysRef.current.handleCopy();
		};
		window.addEventListener("keydown", handler, true);
		document.addEventListener("copy", copyHandler, true);
		return () => {
			window.removeEventListener("keydown", handler, true);
			document.removeEventListener("copy", copyHandler, true);
		};
	}, [open]);

	const wasOpen = useRef(false);
	useEffect(() => {
		if (open) {
			wasOpen.current = true;
			const active = document.activeElement;
			openerRef.current = active instanceof HTMLElement ? active : null;
			dialogRef.current?.focus();
			return;
		}
		if (!wasOpen.current) return;
		wasOpen.current = false;
		const target = focusOnCloseRef.current?.() ?? openerRef.current;
		if (target?.isConnected) target.focus();
	}, [open]);

	const trapTab = (event: ReactKeyboardEvent<HTMLDivElement>) => {
		if (event.key !== "Tab" || !dialogRef.current) return;
		const focusable = [
			...dialogRef.current.querySelectorAll<HTMLElement>(
				"button:not([disabled])",
			),
		];
		const first = focusable[0];
		const last = focusable.at(-1);
		if (!first || !last) {
			event.preventDefault();
			return;
		}
		const active = document.activeElement;
		if (event.shiftKey && (active === first || active === dialogRef.current)) {
			event.preventDefault();
			last.focus();
		} else if (!event.shiftKey && active === last) {
			event.preventDefault();
			first.focus();
		}
	};

	const handleDownload = async () => {
		setIsSaving(true);
		await onDownload();
		setIsSaving(false);
	};

	const current = position ? position.index + 1 : 0;
	const total = position?.total ?? 0;

	return createPortal(
		<AnimatePresence>
			{open && (
				<motion.div
					key="image-preview"
					aria-label={filename}
					aria-modal="true"
					data-state="open"
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					exit={{ opacity: 0 }}
					transition={{ duration: 0.15, ease: "easeOut" }}
					className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 outline-none"
					onClick={(e) => {
						if (e.target === e.currentTarget) onClose();
					}}
					onKeyDown={trapTab}
					ref={dialogRef}
					role="dialog"
					tabIndex={-1}
				>
					{shownSrc ? (
						<div className="relative">
							<img
								src={shownSrc}
								alt={filename}
								className="block max-h-[85vh] max-w-[90vw] rounded-lg object-contain"
								onError={() => setBrokenSrc(shownSrc)}
							/>
							{copyCount > 0 && !reduceMotion && (
								<motion.div
									animate={{ opacity: 0 }}
									className="pointer-events-none absolute inset-0 rounded-lg bg-white"
									data-copy-flash
									initial={{ opacity: 0.5 }}
									key={copyCount}
									transition={{ duration: 0.4, ease: "easeOut" }}
								/>
							)}
						</div>
					) : (
						<div className="flex items-center justify-center text-sm text-white/80">
							{src !== null
								? t({ message: `Couldn't load ${filename}` })
								: (fallback ?? <Spinner className="size-6 text-white" />)}
						</div>
					)}
					{inSequence && (
						<>
							<button
								type="button"
								aria-label={t({ message: "Previous image" })}
								className={cn(EDGE_BUTTON_CLASS, "left-4")}
								onClick={onPrevious}
							>
								<ChevronLeftIcon className="size-6" />
							</button>
							<button
								type="button"
								aria-label={t({ message: "Next image" })}
								className={cn(EDGE_BUTTON_CLASS, "right-4")}
								onClick={onNext}
							>
								<ChevronRightIcon className="size-6" />
							</button>
							<div className="-translate-x-1/2 absolute bottom-4 left-1/2 rounded-full bg-white/10 px-3 py-1 text-white/80 text-xs tabular-nums">
								{t({ message: `${current} of ${total}` })}
							</div>
						</>
					)}
					<div className="absolute top-4 right-4 flex items-center gap-2">
						{onCopy && (
							<button
								type="button"
								aria-label={
									copied
										? t({ message: "Copied" })
										: t({ message: "Copy image" })
								}
								disabled={shownSrc === null}
								onClick={() => void handleCopy()}
								className={cn(
									CORNER_BUTTON_CLASS,
									copied &&
										"bg-emerald-500 text-white hover:bg-emerald-500 active:bg-emerald-500",
								)}
							>
								<motion.span
									animate={{ scale: 1 }}
									className="flex"
									initial={reduceMotion ? false : { scale: 0.4 }}
									key={copied ? "copied" : "copy"}
									transition={{ type: "spring", stiffness: 500, damping: 18 }}
								>
									{copied ? (
										<CheckIcon className="size-4" />
									) : (
										<CopyIcon className="size-4" />
									)}
								</motion.span>
							</button>
						)}
						<button
							type="button"
							aria-label={t({
								message: "Download image",
							})}
							disabled={isSaving || shownSrc === null}
							onClick={() => void handleDownload()}
							className={CORNER_BUTTON_CLASS}
						>
							<DownloadIcon className="size-4" />
						</button>
						<button
							type="button"
							aria-label={t({
								message: "Close preview",
							})}
							onClick={onClose}
							className={CORNER_BUTTON_CLASS}
						>
							<XIcon className="size-4" />
						</button>
					</div>
				</motion.div>
			)}
		</AnimatePresence>,
		document.body,
	);
}
