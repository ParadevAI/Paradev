import { useLingui } from "@lingui/react/macro";
import {
	CAPSULE_TAB_SLOT_CLASS,
	capsuleTabClassName,
	HEADER_TAB_CLOSE_CLASS,
	TAB_DIVIDER_CLASS,
} from "@superset/ui/lib/header-controls";
import { cn } from "@superset/ui/utils";
import { type MouseEvent, type ReactNode, useEffect, useRef } from "react";
import { LuX } from "react-icons/lu";

interface ChatTabProps {
	label: string;
	icon: ReactNode;
	isActive: boolean;
	showDivider: boolean;
	onActivate: () => void;
	onClose: () => void;
}

export function ChatTab({
	label,
	icon,
	isActive,
	showDivider,
	onActivate,
	onClose,
}: ChatTabProps) {
	const { t } = useLingui();
	const ref = useRef<HTMLDivElement>(null);
	useEffect(() => {
		if (isActive)
			ref.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
	}, [isActive]);
	const closeOnMiddleClick = (event: MouseEvent<HTMLButtonElement>) => {
		if (event.button !== 1) return;
		event.preventDefault();
		onClose();
	};
	return (
		<div ref={ref} className={CAPSULE_TAB_SLOT_CLASS}>
			{showDivider && <span className={TAB_DIVIDER_CLASS} />}
			<div className={cn(capsuleTabClassName(isActive), "group pr-2")}>
				<button
					type="button"
					aria-current={isActive ? "page" : undefined}
					title={label}
					onClick={onActivate}
					onAuxClick={closeOnMiddleClick}
					className="flex h-full min-w-0 flex-1 items-center gap-2 rounded-full pr-1 pl-3 outline-none focus-visible:ring-1 focus-visible:ring-ring"
				>
					<span className="flex shrink-0 items-center [&_svg]:size-3.5">
						{icon}
					</span>
					<span className="truncate">{label}</span>
				</button>
				<button
					type="button"
					aria-label={t({ message: "Close tab" })}
					onClick={onClose}
					className={cn(
						HEADER_TAB_CLOSE_CLASS,
						"rounded-full",
						isActive
							? "opacity-100"
							: "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
					)}
				>
					<LuX className="size-3" />
				</button>
			</div>
		</div>
	);
}
