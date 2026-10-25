import { msg } from "@lingui/core/macro";
import type * as React from "react";
import { LuX } from "react-icons/lu";
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

			{media && (
				<div className="-mx-1 -mt-1 mb-2.5 overflow-hidden rounded-md">
					{media}
				</div>
			)}

			{badge && <Badge variant="box">{badge}</Badge>}

			{onDismiss && (
				<button
					type="button"
					onClick={onDismiss}
					aria-label={i18n._(
						msg({
							message: "Dismiss",
						}),
					)}
					className={cn(
						"absolute z-10 text-muted-foreground hover:text-foreground transition-colors",
						media
							? "-top-2 -right-2 flex size-5 items-center justify-center rounded-full border border-border bg-card shadow-sm"
							: "top-2.5 right-2.5",
					)}
				>
					<LuX className={media ? "size-3" : "size-3.5"} />
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
