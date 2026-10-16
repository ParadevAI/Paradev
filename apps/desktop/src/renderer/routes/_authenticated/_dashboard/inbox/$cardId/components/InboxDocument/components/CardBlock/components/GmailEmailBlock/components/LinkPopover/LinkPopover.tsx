import { useLingui } from "@lingui/react/macro";
import { Popover, PopoverAnchor, PopoverContent } from "@superset/ui/popover";
import { useEffect, useRef, useState } from "react";
import { LuLink, LuTextQuote } from "react-icons/lu";

export interface LinkDraft {
	text: string;
	href: string;
	/** Where the link goes in the body, in viewport pixels; the popover opens under it. */
	anchor: DOMRect;
}

interface LinkPopoverProps {
	initial: LinkDraft | null;
	onSave: (link: { text: string; href: string }) => void;
	onCancel: () => void;
}

function withScheme(target: string): string {
	if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith("/"))
		return target;
	return target.includes("@") && !target.includes("/")
		? `mailto:${target}`
		: `https://${target}`;
}

/** Gmail's link popover under the text: the link, Apply, and the text to show when nothing was selected. */
export function LinkPopover({ initial, onSave, onCancel }: LinkPopoverProps) {
	const { t } = useLingui();
	const [text, setText] = useState("");
	const [href, setHref] = useState("");
	useEffect(() => {
		setText(initial?.text ?? "");
		setHref(initial?.href ?? "");
	}, [initial]);
	const asksText = Boolean(initial && !initial.text);
	const first = useRef<HTMLInputElement>(null);
	const target = href.trim();
	const save = () => {
		if (!target) return;
		onSave({ text: text.trim() || target, href: withScheme(target) });
	};
	const field =
		"flex h-10 items-center gap-3 rounded-md border border-border px-3 focus-within:border-primary focus-within:ring-1 focus-within:ring-primary";
	return (
		<Popover
			open={initial !== null}
			onOpenChange={(open) => !open && onCancel()}
		>
			<PopoverAnchor
				virtualRef={{
					current: {
						getBoundingClientRect: () => initial?.anchor ?? new DOMRect(),
					},
				}}
			/>
			<PopoverContent
				align="start"
				sideOffset={6}
				className="w-auto rounded-xl p-4"
				onOpenAutoFocus={(event) => {
					event.preventDefault();
					first.current?.focus();
				}}
			>
				<form
					className="flex items-end gap-4"
					onSubmit={(event) => {
						event.preventDefault();
						save();
					}}
				>
					<div className="flex w-64 flex-col gap-2">
						{asksText && (
							<label className={field}>
								<LuTextQuote className="size-4 shrink-0 text-muted-foreground" />
								<input
									ref={first}
									aria-label={t({ message: "Anchor Text" })}
									placeholder={t({ message: "Text" })}
									value={text}
									onChange={(event) => setText(event.target.value)}
									className="min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-muted-foreground"
								/>
							</label>
						)}
						<label className={field}>
							<LuLink className="size-4 shrink-0 text-muted-foreground" />
							<input
								ref={asksText ? undefined : first}
								aria-label={t({ message: "Link" })}
								placeholder={t({ message: "Type or paste a link" })}
								value={href}
								onChange={(event) => setHref(event.target.value)}
								className="min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-muted-foreground"
							/>
						</label>
					</div>
					<button
						type="submit"
						disabled={!target}
						className="h-10 px-1 text-[14px] font-medium text-primary disabled:text-muted-foreground"
					>
						{t({ message: "Apply" })}
					</button>
				</form>
			</PopoverContent>
		</Popover>
	);
}
