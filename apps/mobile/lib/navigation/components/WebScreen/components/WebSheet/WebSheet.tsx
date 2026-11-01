import { useLingui } from "@lingui/react/macro";
import { PortalHost } from "@rn-primitives/portal";
import { type ReactNode, useEffect, useRef } from "react";
import {
	Pressable,
	useWindowDimensions,
	View,
	type ViewInstance,
} from "react-native";
import { cn } from "@/lib/utils";
import { sheetHeaderHostName } from "../../../SheetHeaderSlot/hostName";
import { sheetFrame } from "../../utils/sheetFrame";

const FOCUSABLE =
	'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface WebSheetProps {
	routeKey: string;
	title?: string;
	detents: readonly number[];
	focused: boolean;
	onClose: () => void;
	children: ReactNode;
}

/** A sheet route drawn over the screen it opened from, with a backdrop that closes it. */
export function WebSheet({
	routeKey,
	title,
	detents,
	focused,
	onClose,
	children,
}: WebSheetProps) {
	const { t } = useLingui();
	const frame = sheetFrame(useWindowDimensions(), detents);
	const cardRef = useRef<ViewInstance>(null);

	useEffect(() => {
		const card = cardRef.current as unknown as HTMLElement | null;
		if (!card) return;
		card.dataset.webSheet = "";
		const opener =
			document.activeElement instanceof HTMLElement
				? document.activeElement
				: null;
		if (!card.contains(document.activeElement)) card.focus();
		return () => {
			if (opener?.isConnected) opener.focus();
		};
	}, []);

	useEffect(() => {
		if (!focused) return;
		const card = cardRef.current as unknown as HTMLElement | null;
		if (!card) return;
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key !== "Tab") return;
			const items = [...card.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
				(item) => item.offsetParent !== null,
			);
			const first = items[0];
			const last = items[items.length - 1];
			if (!first || !last) {
				event.preventDefault();
				card.focus();
				return;
			}
			const inside = card.contains(document.activeElement);
			if (event.shiftKey && (!inside || document.activeElement === first)) {
				event.preventDefault();
				last.focus();
			} else if (
				!event.shiftKey &&
				(!inside || document.activeElement === last)
			) {
				event.preventDefault();
				first.focus();
			}
		};
		document.addEventListener("keydown", onKeyDown, true);
		return () => document.removeEventListener("keydown", onKeyDown, true);
	}, [focused]);

	const dialog = frame.kind === "dialog";
	return (
		<View
			className={cn(
				"absolute inset-0 items-center",
				dialog ? "justify-center" : "justify-end",
			)}
		>
			<Pressable
				accessibilityLabel={t({ message: "Close" })}
				focusable={false}
				className="absolute inset-0 cursor-default bg-black/50"
				onPress={onClose}
			/>
			<View
				ref={cardRef}
				role="dialog"
				aria-modal
				aria-label={title || undefined}
				tabIndex={-1}
				className={cn(
					"bg-background border-border overflow-hidden outline-none",
					dialog ? "rounded-2xl border shadow-2xl" : "rounded-t-3xl border-t",
				)}
				style={{ width: frame.width, height: frame.height }}
			>
				<PortalHost name={sheetHeaderHostName(routeKey)} />
				<View className="flex-1">{children}</View>
			</View>
		</View>
	);
}
