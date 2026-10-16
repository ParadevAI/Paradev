import type { SlackAttachmentView } from "../../../../types";

type LinkPreview = NonNullable<SlackAttachmentView["link"]>;

interface SlackLinkPreviewProps {
	link: LinkPreview;
}

/** A pasted link's preview as Slack draws it: title, description and site, the image on the right. */
export function SlackLinkPreview({ link }: SlackLinkPreviewProps) {
	return (
		<a
			href={link.url}
			target="_blank"
			rel="noreferrer"
			className="mt-1 flex max-w-xl overflow-hidden rounded-lg border border-border text-[13px] leading-relaxed transition-colors hover:bg-fill-hover/60"
		>
			<div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 p-3">
				{link.title && (
					<span className="line-clamp-2 font-bold text-foreground">
						{link.title}
					</span>
				)}
				{link.text && (
					<span className="line-clamp-3 text-muted-foreground">
						{link.text}
					</span>
				)}
				{link.site && (
					<span className="mt-0.5 flex items-center gap-1.5 text-muted-foreground">
						{link.icon && (
							<img src={link.icon} alt="" className="size-4 rounded-sm" />
						)}
						<span className="truncate">{link.site}</span>
					</span>
				)}
			</div>
			{link.image && (
				<img
					src={link.image}
					alt=""
					className="w-28 shrink-0 object-cover sm:w-36"
				/>
			)}
		</a>
	);
}
