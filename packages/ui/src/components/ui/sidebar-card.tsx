import { msg } from "@lingui/core/macro";
import type * as React from "react";
import { LuMinus, LuX } from "react-icons/lu";
import { i18n } from "../../lib/i18n";
import { cn } from "../../lib/utils";
import { Badge } from "./badge";
import { Button } from "./button";

interface SidebarCardProps {
	badge?: string;
	title: string;
	description?: string;
	actionLabel?: string;
	onAction?: () => void;
	onDismiss?: () => void;
	/** Makes the whole card a button. */
	onClick?: () => void;
	/** Rendered edge to edge above the title. */
	media?: React.ReactNode;
	className?: string;
	children?: React.ReactNode;
}

function SidebarCard({
	badge,
	title,
	description,
	actionLabel,
	onAction,
	onDismiss,
	onClick,
	media,
	className,
	children,
}: SidebarCardProps) {
	const dismissLabel = i18n._(
		msg({
			message: "Dismiss",
		}),
	);

	if (media) {
		return (
			<div
				data-slot="sidebar-card"
				className={cn(
					"group relative isolate overflow-hidden rounded-xl border border-white/10 bg-black shadow-sm",
					"transition-[transform,box-shadow] duration-300 ease-out hover:-translate-y-0.5 hover:shadow-lg",
					className,
				)}
			>
				<div className="relative">
					<div className="transition-transform duration-500 ease-out group-hover:scale-[1.04]">
						{media}
					</div>
					<div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black via-black/70 via-35% to-transparent to-70%" />
					<div className="pointer-events-none absolute inset-x-0 bottom-0 p-3.5">
						{badge && <Badge variant="box">{badge}</Badge>}
						<p
							className={cn("text-sm font-medium text-white", badge && "mt-2")}
						>
							{title}
						</p>
						{description && (
							<p className="mt-0.5 text-sm text-white/55 leading-snug">
								{description}
							</p>
						)}
					</div>
				</div>

				{onClick && (
					<button
						type="button"
						onClick={onClick}
						aria-label={title}
						className="absolute inset-0 z-10 rounded-xl focus-visible:outline-2 focus-visible:outline-ring"
					/>
				)}

				{onDismiss && (
					<button
						type="button"
						onClick={onDismiss}
						aria-label={dismissLabel}
						className="absolute top-1.5 right-1.5 z-20 flex size-6 items-center justify-center rounded-md text-white/70 opacity-0 transition-[opacity,color,background-color] duration-200 hover:bg-white/10 hover:text-white focus-visible:opacity-100 group-hover:opacity-100"
					>
						<LuMinus className="size-3.5" />
					</button>
				)}

				{children}

				{actionLabel && onAction && (
					<div className="relative z-20 px-3 pb-3">
						<Button
							variant="outline"
							size="sm"
							className="w-full h-7 text-xs"
							onClick={onAction}
						>
							{actionLabel}
						</Button>
					</div>
				)}
			</div>
		);
	}

	return (
		<div
			data-slot="sidebar-card"
			className={cn(
				"relative rounded-lg border border-border bg-card p-3",
				onClick && "transition-colors hover:bg-accent/40",
				className,
			)}
		>
			{onClick && (
				<button
					type="button"
					onClick={onClick}
					aria-label={title}
					className="absolute inset-0 rounded-lg focus-visible:outline-2 focus-visible:outline-ring"
				/>
			)}

			{badge && <Badge variant="box">{badge}</Badge>}

			{onDismiss && (
				<button
					type="button"
					onClick={onDismiss}
					aria-label={dismissLabel}
					className="absolute top-2.5 right-2.5 z-10 text-muted-foreground hover:text-foreground transition-colors"
				>
					<LuX className="size-3.5" />
				</button>
			)}

			<p
				className={cn(
					"text-sm font-semibold text-card-foreground",
					badge && "mt-2",
				)}
			>
				{title}
			</p>

			{description && (
				<p className="text-xs text-muted-foreground mt-1 leading-snug">
					{description}
				</p>
			)}

			{children}

			{actionLabel && onAction && (
				<Button
					variant="outline"
					size="sm"
					className="mt-3 w-full h-7 text-xs"
					onClick={onAction}
				>
					{actionLabel}
				</Button>
			)}
		</div>
	);
}

export { SidebarCard, type SidebarCardProps };
