"use client";

import { $createLinkNode, TOGGLE_LINK_COMMAND } from "@lexical/link";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { useLingui } from "@lingui/react/macro";
import { Popover, PopoverAnchor, PopoverContent } from "@superset/ui/popover";
import { $createTextNode, $getSelection, $isRangeSelection } from "lexical";
import { LinkIcon } from "lucide-react";
import { useState } from "react";
import { ToolbarButton } from "../ToolbarButton";
import { normalizeUrl } from "./utils/normalizeUrl";

/** Links the selected text, inserts the link at the caret, or unlinks a link. */
export function LinkButton({ active }: { active: boolean }) {
	const { t } = useLingui();
	const [editor] = useLexicalComposerContext();
	const [open, setOpen] = useState(false);
	const [url, setUrl] = useState("");

	const apply = () => {
		const value = url.trim();
		setOpen(false);
		setUrl("");
		editor.focus();
		const href = value ? normalizeUrl(value) : null;
		if (!href) return;
		editor.update(() => {
			const selection = $getSelection();
			if ($isRangeSelection(selection) && selection.isCollapsed()) {
				const link = $createLinkNode(href);
				link.append($createTextNode(value));
				selection.insertNodes([link]);
				return;
			}
			editor.dispatchCommand(TOGGLE_LINK_COMMAND, href);
		});
	};

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverAnchor asChild>
				<span className="inline-flex">
					<ToolbarButton
						label={
							active ? t({ message: "Remove link" }) : t({ message: "Link" })
						}
						active={active}
						onClick={() => {
							if (active) editor.dispatchCommand(TOGGLE_LINK_COMMAND, null);
							else setOpen(true);
						}}
					>
						<LinkIcon />
					</ToolbarButton>
				</span>
			</PopoverAnchor>
			<PopoverContent
				align="start"
				side="top"
				className="w-72 p-2"
				onOpenAutoFocus={(event) => {
					event.preventDefault();
					(event.currentTarget as HTMLElement | null)
						?.querySelector("input")
						?.focus();
				}}
			>
				<form
					onSubmit={(event) => {
						event.preventDefault();
						apply();
					}}
				>
					<input
						value={url}
						onChange={(event) => setUrl(event.target.value)}
						placeholder={t({ message: "Paste a link" })}
						className="h-8 w-full rounded-md border border-border bg-background px-2 text-sm outline-none focus:ring-1 focus:ring-ring"
					/>
				</form>
			</PopoverContent>
		</Popover>
	);
}
