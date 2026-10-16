import { Plural, Trans } from "@lingui/react/macro";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useEffect, useState } from "react";
import {
	LuDownload,
	LuFile,
	LuFileText,
	LuFileX,
	LuImage,
} from "react-icons/lu";
import type { GmailAttachmentView } from "../../types";
import { fileSize } from "../../utils/fileSize";
import { pdfFirstPage } from "../../utils/pdfFirstPage";

interface AttachmentListProps {
	attachments: GmailAttachmentView[];
}

const PREVIEW_WIDTH = 360;

/** What sits above the file's name: the image itself, the PDF's first page, or the file type's mark. */
function Preview({ file }: { file: GmailAttachmentView }) {
	const [page, setPage] = useState<string | null>(null);
	const isPdf = file.mimeType === "application/pdf";
	useEffect(() => {
		if (!isPdf) return;
		let live = true;
		void pdfFirstPage(file.url, PREVIEW_WIDTH).then((image) => {
			if (live) setPage(image);
		});
		return () => {
			live = false;
		};
	}, [isPdf, file.url]);
	if (file.mimeType.startsWith("image/"))
		return <img src={file.url} alt="" className="h-full w-full object-cover" />;
	if (page)
		return (
			<img
				src={page}
				alt=""
				className="h-full w-full object-cover object-top"
			/>
		);
	return <FileIcon mimeType={file.mimeType} large />;
}

function FileIcon({ mimeType, large }: { mimeType: string; large?: boolean }) {
	const size = large ? "size-8" : "size-4";
	if (mimeType.startsWith("image/"))
		return <LuImage className={`${size} shrink-0 text-[#d93025]`} />;
	if (mimeType === "application/pdf")
		return <LuFileText className={`${size} shrink-0 text-[#d93025]`} />;
	return <LuFile className={`${size} shrink-0 text-muted-foreground`} />;
}

/** Gmail's attachment cards under a message: a preview above the file's name, a download on hover; a file Gmail blocks only says so. */
export function AttachmentList({ attachments }: AttachmentListProps) {
	return (
		<div className="mt-4 border-t border-border pt-3">
			<p className="mb-2 text-[13px] font-semibold text-foreground">
				<Plural
					value={attachments.length}
					one="One attachment"
					other="# attachments"
				/>
			</p>
			<div className="flex flex-wrap gap-3">
				{attachments.map((file) =>
					file.blocked ? (
						<div
							key={file.partId}
							className="flex h-[120px] w-[180px] flex-col overflow-hidden rounded-lg border border-border bg-muted/40"
						>
							<div className="flex min-h-0 flex-1 items-center justify-center bg-muted/60">
								<LuFileX className="size-5 text-muted-foreground" />
							</div>
							<div className="flex h-11 shrink-0 flex-col justify-center border-t border-border bg-background px-2.5">
								<span className="truncate text-[12.5px] text-muted-foreground">
									{file.filename}
								</span>
								<span className="text-[11.5px] text-destructive">
									<Trans>Blocked file</Trans>
								</span>
							</div>
						</div>
					) : (
						<Tooltip key={file.partId} delayDuration={400}>
							<TooltipTrigger asChild>
								<a
									href={file.url}
									target="_blank"
									rel="noreferrer"
									className="group/file relative flex h-[120px] w-[180px] flex-col overflow-hidden rounded-lg border border-border bg-muted/40 transition-shadow hover:shadow-md"
								>
									<div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-muted/60">
										<Preview file={file} />
									</div>
									<div className="flex h-9 shrink-0 items-center gap-2 border-t border-border bg-background px-2.5">
										<FileIcon mimeType={file.mimeType} />
										<span className="min-w-0 flex-1 truncate text-[12.5px] text-foreground">
											{file.filename}
										</span>
									</div>
									<div className="absolute inset-0 hidden flex-col justify-between bg-black/60 p-2.5 text-white group-hover/file:flex">
										<span className="line-clamp-2 text-[12.5px] font-medium">
											{file.filename}
										</span>
										<span className="flex items-center justify-between text-[11px] text-white/80">
											{fileSize(file.size)}
											<span className="flex size-7 items-center justify-center rounded-full bg-white/20">
												<LuDownload className="size-3.5" />
											</span>
										</span>
									</div>
								</a>
							</TooltipTrigger>
							<TooltipContent side="bottom">{file.filename}</TooltipContent>
						</Tooltip>
					),
				)}
			</div>
		</div>
	);
}
