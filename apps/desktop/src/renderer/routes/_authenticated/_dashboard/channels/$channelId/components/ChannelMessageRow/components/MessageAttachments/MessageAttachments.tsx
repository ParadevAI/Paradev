import type { ChannelAttachment } from "@superset/shared/channels";
import { useState } from "react";
import { useElementWidth } from "../../../../hooks/useElementWidth";
import { FileAttachment } from "./components/FileAttachment";
import { ImageAttachment } from "./components/ImageAttachment";
import {
	galleryLayout,
	maxVisibleImages,
	type Size,
} from "./utils/galleryLayout";

/** Until an image loads, lay it out as a landscape photo. */
const UNKNOWN_SIZE: Size = { width: 1600, height: 1200 };

function chunk<T>(items: T[], size: number): T[][] {
	const rows: T[][] = [];
	for (let index = 0; index < items.length; index += size) {
		rows.push(items.slice(index, index + size));
	}
	return rows;
}

/** Images as Slack's gallery, sized from their own shape; other files as cards below. */
export function MessageAttachments({
	attachments,
}: {
	attachments: ChannelAttachment[];
}) {
	const [element, setElement] = useState<HTMLDivElement | null>(null);
	const width = useElementWidth(element);
	const [naturals, setNaturals] = useState<Record<string, Size>>({});
	const [failed, setFailed] = useState<Set<string>>(() => new Set());
	const [expanded, setExpanded] = useState(false);
	if (attachments.length === 0) return null;

	const isImage = (file: ChannelAttachment) =>
		file.contentType.startsWith("image/") && !failed.has(file.id);
	const images = attachments.filter(isImage);
	const files = attachments.filter((file) => !isImage(file));
	const perRow = width === null ? 1 : maxVisibleImages(width);
	const rows = expanded ? chunk(images, perRow) : [images];

	return (
		<div ref={setElement} className="mt-1 flex flex-col gap-2">
			{width !== null &&
				rows.map((row) => {
					const sizes = galleryLayout(
						width,
						row.map((file) => naturals[file.id] ?? UNKNOWN_SIZE),
					);
					const hidden = row.length - sizes.length;
					return (
						<div key={row[0]?.id} className="flex gap-2">
							{sizes.map((size, index) => {
								const file = row[index];
								if (!file) return null;
								const isLast = index === sizes.length - 1;
								return (
									<ImageAttachment
										key={file.id}
										file={file}
										size={size}
										moreCount={isLast ? hidden : 0}
										onShowMore={() => setExpanded(true)}
										onNaturalSize={(natural) =>
											setNaturals((current) =>
												current[file.id]
													? current
													: { ...current, [file.id]: natural },
											)
										}
										onFailed={() =>
											setFailed((current) => new Set(current).add(file.id))
										}
									/>
								);
							})}
						</div>
					);
				})}
			{files.length > 0 && (
				<div className="flex flex-col items-start gap-2">
					{files.map((file) => (
						<FileAttachment key={file.id} file={file} />
					))}
				</div>
			)}
		</div>
	);
}
