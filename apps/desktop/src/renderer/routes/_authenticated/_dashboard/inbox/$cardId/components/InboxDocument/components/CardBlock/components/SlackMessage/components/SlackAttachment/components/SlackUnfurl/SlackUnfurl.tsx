import { useState } from "react";
import { LuChevronDown } from "react-icons/lu";
import type { SlackAttachmentView } from "../../../../types";
import { RichTextBlock } from "../../../RichTextBlock";

type Unfurl = NonNullable<SlackAttachmentView["unfurl"]>;

interface SlackUnfurlProps {
	unfurl: Unfurl;
	/** When Slack last fetched the record: the message's own time. */
	asOf: string;
}

/**
 * An app's link card, the way Slack lays it out: the app's name with a
 * caret that folds the card, then the record's icon, title and key fields,
 * and when the details were fetched.
 */
export function SlackUnfurl({ unfurl, asOf }: SlackUnfurlProps) {
	const [open, setOpen] = useState(true);
	return (
		<div className="mt-1 flex max-w-xl flex-col gap-1.5">
			<button
				type="button"
				onClick={() => setOpen((v) => !v)}
				aria-expanded={open}
				className="flex w-fit items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground"
			>
				{unfurl.app}
				<LuChevronDown className={open ? "size-3.5" : "size-3.5 -rotate-90"} />
			</button>
			{open && (
				<div className="overflow-hidden rounded-lg border border-border">
					<div className="flex gap-3 p-3">
						{unfurl.icon && (
							<img
								src={unfurl.icon}
								alt=""
								className="size-9 shrink-0 rounded-md"
							/>
						)}
						<div className="flex min-w-0 flex-col gap-0.5">
							{unfurl.url ? (
								<a
									href={unfurl.url}
									target="_blank"
									rel="noreferrer"
									className="truncate text-[13.5px] font-bold text-foreground hover:underline"
								>
									{unfurl.title}
								</a>
							) : (
								<span className="truncate text-[13.5px] font-bold text-foreground">
									{unfurl.title}
								</span>
							)}
							{unfurl.subtitle && (
								<span className="text-xs font-semibold text-muted-foreground">
									{unfurl.subtitle}
								</span>
							)}
							{unfurl.fields.length > 0 && (
								<div className="mt-2 flex flex-wrap gap-x-8 gap-y-2 text-[13px]">
									{unfurl.fields.map((field) => (
										<div key={field.label} className="flex flex-col gap-0.5">
											<span className="text-muted-foreground">
												{field.label}
											</span>
											<RichTextBlock
												block={{ type: "rich_text", elements: field.value }}
											/>
										</div>
									))}
								</div>
							)}
						</div>
					</div>
					<div className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
						{asOf}
					</div>
				</div>
			)}
		</div>
	);
}
