import { useLingui } from "@lingui/react/macro";
import { useEffect, useRef, useState } from "react";
import type { GmailAttachmentView } from "../../types";
import { uploadAttachment } from "../../utils/uploadAttachment";

export interface DraftFile {
	key: string;
	name: string;
	size: number;
	mimeType: string;
	/** Uploading or saving into the Gmail draft; `progress` runs 0–1 while uploading. */
	state: "uploading" | "saving" | "ready" | "blocked" | "failed";
	progress: number;
	url: string | null;
	error: string | null;
}

interface Upload {
	key: string;
	file: File;
	progress: number;
	fileId: string | null;
	error: string | null;
}

/** Gmail's ceiling for one email; Gmail moves anything larger to Drive, which Superset can't reach. */
const EMAIL_BYTES_MAX = 25 * 1024 * 1024;

/** What `save_draft` keeps and adds. */
export interface AttachmentChange {
	keep: string[];
	uploads: string[];
}

/**
 * The draft's files as Gmail's compose window shows them: the ones already
 * on the Gmail draft, files being uploaded, and every add or remove saved
 * back to the draft as soon as it settles, as Gmail autosaves. Without
 * `onSave` there is no Gmail draft, so uploads stay here until Send.
 */
export function useDraftAttachments(
	attachments: GmailAttachmentView[],
	onSave?: (change: AttachmentChange) => void,
	/** Why the last save failed; files still waiting on it fail with this reason. */
	saveFailure: string | null = null,
) {
	const { t } = useLingui();
	const [removed, setRemoved] = useState<Set<string>>(new Set());
	const [uploads, setUploads] = useState<Upload[]>([]);
	const [dirty, setDirty] = useState(false);
	const saved = useRef(attachments);
	const onSaveRef = useRef(onSave);
	onSaveRef.current = onSave;

	useEffect(() => {
		if (saved.current === attachments) return;
		saved.current = attachments;
		setRemoved(new Set());
		setUploads((current) => current.filter((u) => !u.fileId && !u.error));
	}, [attachments]);

	const kept = attachments.filter((a) => !removed.has(a.partId));
	useEffect(() => {
		if (!saveFailure || !onSaveRef.current) return;
		setUploads((current) =>
			current.map((u) =>
				u.fileId && !u.error ? { ...u, error: saveFailure } : u,
			),
		);
	}, [saveFailure]);
	const uploading = uploads.some((u) => !u.fileId && !u.error);
	useEffect(() => {
		if (!dirty || uploading || !onSaveRef.current) return;
		setDirty(false);
		onSaveRef.current?.({
			keep: kept.map((a) => a.partId),
			uploads: uploads.flatMap((u) => (u.fileId ? [u.fileId] : [])),
		});
	}, [dirty, uploading, kept, uploads]);

	const add = (files: File[]) => {
		let total =
			kept.reduce((sum, a) => sum + a.size, 0) +
			uploads.reduce((sum, u) => sum + (u.error ? 0 : u.file.size), 0);
		const added: Upload[] = files.map((file) => {
			total += file.size;
			return {
				key: crypto.randomUUID(),
				file,
				progress: 0,
				fileId: null,
				error:
					total > EMAIL_BYTES_MAX
						? t({ message: "Over Gmail's 25 MB limit" })
						: null,
			};
		});
		setUploads((current) => [...current, ...added]);
		for (const upload of added.filter((u) => !u.error)) {
			uploadAttachment(upload.file, (progress) =>
				setUploads((current) =>
					current.map((u) => (u.key === upload.key ? { ...u, progress } : u)),
				),
			)
				.then((fileId) => {
					setUploads((current) =>
						current.map((u) =>
							u.key === upload.key ? { ...u, fileId, progress: 1 } : u,
						),
					);
					setDirty(true);
				})
				.catch((error: unknown) =>
					setUploads((current) =>
						current.map((u) =>
							u.key === upload.key
								? {
										...u,
										error:
											error instanceof Error ? error.message : String(error),
									}
								: u,
						),
					),
				);
		}
	};

	const remove = (key: string) => {
		const upload = uploads.find((u) => u.key === key);
		if (upload) {
			setUploads((current) => current.filter((u) => u.key !== key));
			if (upload.fileId) setDirty(true);
			return;
		}
		setRemoved((current) => new Set(current).add(key));
		setDirty(true);
	};

	/** The change that drops every file Gmail refuses. */
	const withoutBlocked = (): AttachmentChange => ({
		keep: kept.filter((a) => !a.blocked).map((a) => a.partId),
		uploads: uploads.flatMap((u) => (u.fileId ? [u.fileId] : [])),
	});

	const files: DraftFile[] = [
		...kept.map((a) => ({
			key: a.partId,
			name: a.filename,
			size: a.size,
			mimeType: a.mimeType,
			state: a.blocked ? ("blocked" as const) : ("ready" as const),
			progress: 1,
			url: a.blocked ? null : a.url,
			error: null,
		})),
		...uploads.map((u) => ({
			key: u.key,
			name: u.file.name,
			size: u.file.size,
			mimeType: u.file.type,
			state: u.error
				? ("failed" as const)
				: !u.fileId
					? ("uploading" as const)
					: onSave
						? ("saving" as const)
						: ("ready" as const),
			progress: u.progress,
			url: null,
			error: u.error,
		})),
	];
	return {
		files,
		blocked: kept.filter((a) => a.blocked),
		busy: onSave ? uploads.some((u) => !u.error) : uploading,
		add,
		remove,
		withoutBlocked,
	};
}
