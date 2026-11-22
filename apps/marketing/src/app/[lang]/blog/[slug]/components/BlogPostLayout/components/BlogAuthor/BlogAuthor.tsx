"use client";

import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { useEffect, useRef, useState } from "react";
import { AuthorAvatar } from "@/app/[lang]/blog/components/AuthorAvatar";
import type { BlogPost } from "@/lib/blog-utils";

interface BlogAuthorProps {
	author: BlogPost["author"];
}

export function BlogAuthor({ author }: BlogAuthorProps) {
	const [open, setOpen] = useState(false);
	const openedFromHover = useRef(false);
	const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const triggerRef = useRef<HTMLButtonElement>(null);
	const contentRef = useRef<HTMLDivElement>(null);

	function cancelClose() {
		if (closeTimer.current) clearTimeout(closeTimer.current);
	}

	function scheduleClose() {
		cancelClose();
		closeTimer.current = setTimeout(() => {
			if (!contentRef.current?.contains(document.activeElement)) setOpen(false);
		}, 150);
	}

	useEffect(
		() => () => {
			if (closeTimer.current) clearTimeout(closeTimer.current);
		},
		[],
	);

	const profiles = [
		{ label: "X", href: author.twitter && `https://x.com/${author.twitter}` },
		{
			label: "GitHub",
			href: author.github && `https://github.com/${author.github}`,
		},
		{
			label: "LinkedIn",
			href: author.linkedin && `https://linkedin.com/in/${author.linkedin}`,
		},
	].filter((profile) => profile.href);

	return (
		<Popover
			open={open}
			onOpenChange={(nextOpen) => {
				if (nextOpen) openedFromHover.current = false;
				setOpen(nextOpen);
			}}
		>
			<PopoverTrigger asChild>
				<button
					ref={triggerRef}
					type="button"
					onKeyDown={(event) => {
						if (!["Enter", " ", "ArrowDown"].includes(event.key)) return;
						event.preventDefault();
						cancelClose();
						openedFromHover.current = false;
						setOpen(true);
						requestAnimationFrame(() => {
							(
								contentRef.current?.querySelector("a") ?? contentRef.current
							)?.focus();
						});
					}}
					className="inline-flex items-center gap-2 rounded-sm text-foreground/70 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background"
					onPointerEnter={(event) => {
						if (event.pointerType !== "mouse") return;
						cancelClose();
						openedFromHover.current = true;
						setOpen(true);
					}}
					onPointerLeave={(event) => {
						if (event.pointerType === "mouse") scheduleClose();
					}}
				>
					<AuthorAvatar name={author.name} avatar={author.avatar} size="sm" />
					{author.name}
				</button>
			</PopoverTrigger>
			<PopoverContent
				ref={contentRef}
				align="start"
				sideOffset={10}
				className="w-64 rounded-lg p-4"
				aria-label={author.name}
				onOpenAutoFocus={(event) => {
					if (openedFromHover.current) event.preventDefault();
				}}
				onCloseAutoFocus={(event) => {
					if (openedFromHover.current) event.preventDefault();
				}}
				onEscapeKeyDown={() => triggerRef.current?.focus()}
				onPointerEnter={cancelClose}
				onPointerLeave={scheduleClose}
				onFocusCapture={cancelClose}
			>
				<div className="flex items-center gap-3">
					<AuthorAvatar name={author.name} avatar={author.avatar} />
					<div>
						<p className="text-sm font-medium">{author.name}</p>
						<p className="mt-1 text-xs text-muted-foreground">{author.role}</p>
					</div>
				</div>
				{profiles.length > 0 && (
					<div className="mt-4 flex items-center gap-4">
						{profiles.map((profile) => (
							<a
								key={profile.label}
								href={profile.href || undefined}
								target="_blank"
								rel="noopener noreferrer"
								className="text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
							>
								{profile.label}
							</a>
						))}
					</div>
				)}
			</PopoverContent>
		</Popover>
	);
}
