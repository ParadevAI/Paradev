import {
	fileKind,
	fileMeta,
	fileTitle,
	type Message,
	type SharedFile,
} from "@superset/chats-core";
import { uploadFraction } from "@superset/chats-sync";
import { useEffect, useState } from "react";
import { LuFile } from "react-icons/lu";

interface MessageFileProps {
	file: SharedFile;
	/** This device's copy, while its own send is on its way up. */
	localUri?: string;
	upload?: Message["upload"];
	/** A short-lived address for the file's bytes. */
	link: (fileId: string) => Promise<string>;
	onOpen: (file: SharedFile) => void;
}

/** The file a message shares: a picture drawn in place, anything else as a card that opens it. */
export function MessageFile({
	file,
	localUri,
	upload,
	link,
	onOpen,
}: MessageFileProps) {
	const isPicture = fileKind(file) === "image";
	const isSent = !upload;
	const [source, setSource] = useState(localUri);
	useEffect(() => {
		if (!isPicture || localUri || !isSent) return;
		let live = true;
		link(file.id).then(
			(url) => {
				if (live) setSource(url);
			},
			() => {},
		);
		return () => {
			live = false;
		};
	}, [isPicture, localUri, isSent, link, file.id]);

	const progress = upload && upload.error === undefined && (
		<div className="mt-1.5 h-0.5 w-full overflow-hidden rounded-full bg-foreground/15">
			<div
				className="h-full rounded-full bg-highlight transition-[width] duration-200"
				style={{ width: `${uploadFraction(upload) * 100}%` }}
			/>
		</div>
	);

	if (isPicture && source) {
		return (
			<div>
				<button
					type="button"
					disabled={!isSent}
					onClick={() => onOpen(file)}
					className="block overflow-hidden rounded-xl"
				>
					<img
						src={source}
						alt={fileTitle(file)}
						className="max-h-72 max-w-full object-contain"
					/>
				</button>
				{progress}
			</div>
		);
	}
	return (
		<div>
			<button
				type="button"
				disabled={!isSent}
				onClick={() => onOpen(file)}
				className="flex max-w-full items-center gap-2.5 rounded-xl bg-background/50 py-2 pr-3 pl-2.5 text-left"
			>
				<span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-foreground/10">
					<LuFile className="size-4" />
				</span>
				<span className="min-w-0">
					<span className="block truncate text-sm font-medium">
						{fileTitle(file)}
					</span>
					<span className="block truncate text-xs text-muted-foreground">
						{fileMeta(file)}
					</span>
				</span>
			</button>
			{progress}
		</div>
	);
}
