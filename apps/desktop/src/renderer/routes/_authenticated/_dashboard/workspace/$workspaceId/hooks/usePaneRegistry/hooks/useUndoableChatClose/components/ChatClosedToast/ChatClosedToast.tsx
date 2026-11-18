import { plural } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { Kbd, KbdGroup } from "@superset/ui/kbd";
import { MessageSquareIcon } from "lucide-react";
import { useEffect, useRef } from "react";
import { useHotkeyDisplay } from "renderer/hotkeys";

export function ChatClosedToast({
	titles,
	durationMs,
	onUndo,
}: {
	titles: string[];
	durationMs: number;
	onUndo: () => void;
}) {
	const { t } = useLingui();
	const countdownRef = useRef<HTMLDivElement>(null);
	const { keys } = useHotkeyDisplay("UNDO");

	useEffect(() => {
		const bar = countdownRef.current;
		if (!bar) return;
		const toaster = bar.closest("[data-sonner-toaster]");
		const animation = bar.animate(
			[{ transform: "scaleX(1)" }, { transform: "scaleX(0)" }],
			{ duration: durationMs, easing: "linear", fill: "forwards" },
		);
		let hovered = false;
		let pressed = false;
		const followToastTimer = () => {
			if (hovered || pressed || document.hidden) animation.pause();
			else if (animation.playState === "paused") animation.play();
		};
		const update = (change: () => void) => () => {
			change();
			followToastTimer();
		};
		const listeners = Object.entries({
			mouseenter: update(() => (hovered = true)),
			mousemove: update(() => (hovered = true)),
			mouseleave: update(() => (hovered = pressed)),
			pointerdown: update(() => (pressed = true)),
			pointerup: update(() => (pressed = false)),
		});
		for (const [type, listener] of listeners) {
			toaster?.addEventListener(type, listener);
		}
		document.addEventListener("visibilitychange", followToastTimer);
		return () => {
			for (const [type, listener] of listeners) {
				toaster?.removeEventListener(type, listener);
			}
			document.removeEventListener("visibilitychange", followToastTimer);
			animation.cancel();
		};
	}, [durationMs]);

	return (
		<div className="relative flex w-[356px] items-center gap-3 overflow-hidden rounded-lg border border-border bg-popover py-2.5 pr-2.5 pl-3 shadow-lg">
			<div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
				<MessageSquareIcon className="size-4" />
			</div>
			<div className="min-w-0 flex-1">
				<p className="text-sm font-medium text-popover-foreground">
					{titles.length === 1
						? t({ message: "Chat closed" })
						: t({
								message: plural(titles.length, {
									one: "# chat closed",
									other: "# chats closed",
								}),
							})}
				</p>
				<p className="truncate text-xs text-muted-foreground">
					{titles.join(", ")}
				</p>
			</div>
			<Button
				className="h-7 shrink-0 gap-2 px-2"
				onClick={onUndo}
				size="sm"
				variant="secondary"
			>
				<Trans>Undo</Trans>
				{keys[0] !== "Unassigned" && (
					<KbdGroup>
						{keys.map((key) => (
							<Kbd className="bg-background/60" key={key}>
								{key}
							</Kbd>
						))}
					</KbdGroup>
				)}
			</Button>
			<div
				className="absolute inset-x-0 bottom-0 h-0.5 origin-left bg-muted-foreground/40"
				ref={countdownRef}
			/>
		</div>
	);
}
