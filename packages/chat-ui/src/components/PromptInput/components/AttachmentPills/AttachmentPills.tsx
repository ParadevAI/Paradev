"use client";

import { AttachmentFileCard } from "../../../AttachmentFileCard";
import { PastedTextCard } from "../../../PastedTextCard";
import type { PromptInputAttachment } from "../../types";
import { RemoveButton } from "./components/RemoveButton";
import { RevealButton } from "./components/RevealButton";

export type AttachmentPillsProps = {
	attachments: PromptInputAttachment[];
	onRemove: (id: string) => void;
	onPreviewError?: (id: string) => void;
	onReveal?: (attachment: PromptInputAttachment) => void;
	onAttachmentClick?: (
		attachment: PromptInputAttachment,
		attachments: readonly PromptInputAttachment[],
	) => void;
};

export function AttachmentPills({
	attachments,
	onRemove,
	onPreviewError,
	onReveal,
	onAttachmentClick,
}: AttachmentPillsProps) {
	if (attachments.length === 0) return null;
	return (
		<div className="flex flex-wrap items-center gap-2 px-3 pt-3">
			{attachments.map((attachment) => {
				if (attachment.pastedText) {
					return (
						<PastedTextCard
							key={attachment.id}
							text={attachment.pastedText}
							onRemove={() => onRemove(attachment.id)}
						/>
					);
				}
				const filename = attachment.file.name || "attachment";
				const reveal =
					onReveal && attachment.sourcePath ? (
						<RevealButton onClick={() => onReveal(attachment)} />
					) : null;
				if (attachment.previewUrl) {
					return (
						<div key={attachment.id} className="group/pill relative shrink-0">
							<button
								type="button"
								aria-label={filename}
								className="group/attachment relative block size-16 cursor-pointer overflow-hidden rounded-xl border-[0.5px] border-border bg-foreground/[0.04]"
								onClick={() => onAttachmentClick?.(attachment, attachments)}
							>
								{attachment.file.type.startsWith("video/") ? (
									<video
										src={attachment.previewUrl}
										muted
										className="size-full object-cover"
										onError={() => onPreviewError?.(attachment.id)}
									/>
								) : (
									<img
										src={attachment.previewUrl}
										alt={filename}
										className="size-full object-cover"
										draggable={false}
										onError={() => onPreviewError?.(attachment.id)}
									/>
								)}
								<span className="pointer-events-none absolute inset-0 bg-foreground/[0.02] opacity-0 transition-opacity duration-150 group-hover/attachment:opacity-100" />
							</button>
							<RemoveButton onClick={() => onRemove(attachment.id)} />
							{reveal}
						</div>
					);
				}
				return (
					<div key={attachment.id} className="group/pill relative shrink-0">
						<AttachmentFileCard
							name={filename}
							mediaType={attachment.file.type}
							onClick={() => onAttachmentClick?.(attachment, attachments)}
						/>
						<RemoveButton onClick={() => onRemove(attachment.id)} />
						{reveal}
					</div>
				);
			})}
		</div>
	);
}
