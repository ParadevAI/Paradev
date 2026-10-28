import { useLingui } from "@lingui/react/macro";
import { useState } from "react";
import { displayHost } from "../../../../utils/displayHost";

export type WebsitePreviewImage = {
	dataUrl: string;
	width: number;
	height: number;
};

export type WebsitePreview = {
	title: string | null;
	description: string | null;
	iconDataUrl: string | null;
	image: WebsitePreviewImage | null;
};

export type WebsitePreviewLoad =
	| { status: "loading" }
	| { status: "ready"; preview: WebsitePreview }
	| { status: "unavailable" };

function pathOf(url: string): string {
	try {
		const { pathname, search } = new URL(url);
		return pathname === "/" && !search ? "" : `${pathname}${search}`;
	} catch {
		return "";
	}
}

/** Wider than this reads as a banner; anything squarer is a thumbnail. */
const BANNER_MIN_RATIO = 1.2;

export function WebsitePreviewCard({
	load,
	url,
}: {
	load: WebsitePreviewLoad;
	url: string;
}) {
	const { t } = useLingui();
	const [brokenImages, setBrokenImages] = useState<ReadonlySet<string>>(
		() => new Set(),
	);
	const markBroken = (src: string) =>
		setBrokenImages((previous) => new Set(previous).add(src));
	const preview = load.status === "ready" ? load.preview : null;
	const host = displayHost(url);
	const icon =
		preview?.iconDataUrl && !brokenImages.has(preview.iconDataUrl)
			? preview.iconDataUrl
			: null;
	const image =
		preview?.image && !brokenImages.has(preview.image.dataUrl)
			? preview.image
			: null;
	const banner = image && image.width / image.height >= BANNER_MIN_RATIO;
	const thumbnail = image && !banner ? image : null;
	return (
		<div className="min-w-0 text-left font-sans text-foreground">
			{banner && (
				<img
					alt=""
					className="block max-h-44 w-full border-foreground/[0.08] border-b bg-foreground/[0.04] object-cover"
					draggable={false}
					onError={() => markBroken(image.dataUrl)}
					src={image.dataUrl}
				/>
			)}
			<div className={thumbnail ? "flex gap-3 p-3.5" : "p-3.5"}>
				<div className="min-w-0 flex-1">
					<div className="flex min-w-0 items-center gap-2 text-[11px]">
						<span
							aria-hidden="true"
							className="inline-flex size-4 shrink-0 select-none items-center justify-center overflow-hidden rounded bg-foreground/[0.07] font-semibold text-[9px] text-foreground/55 uppercase"
						>
							{icon ? (
								<img
									alt=""
									className="size-3.5 object-contain"
									draggable={false}
									onError={() => markBroken(icon)}
									src={icon}
								/>
							) : (
								host.charAt(0)
							)}
						</span>
						<span className="min-w-0 truncate text-foreground/45" title={url}>
							<span className="font-medium text-foreground/65">{host}</span>
							{pathOf(url)}
						</span>
					</div>
					{load.status === "loading" ? (
						<output
							aria-label={t({ message: "Loading link preview" })}
							className="mt-2.5 block space-y-2"
						>
							<div className="h-3 w-4/5 rounded bg-foreground/10 motion-safe:animate-pulse" />
							<div className="h-2 w-full rounded bg-foreground/[0.07] motion-safe:animate-pulse" />
						</output>
					) : (
						<>
							{preview?.title && (
								<h3 className="mt-2 line-clamp-2 font-semibold text-[13px] text-foreground leading-[1.35]">
									{preview.title}
								</h3>
							)}
							{preview?.description && (
								<p className="mt-1.5 line-clamp-3 text-[11px] text-foreground/55 leading-[1.45]">
									{preview.description}
								</p>
							)}
						</>
					)}
				</div>
				{thumbnail && (
					<img
						alt=""
						className="size-16 shrink-0 rounded-md border border-foreground/[0.08] bg-foreground/[0.04] object-cover"
						draggable={false}
						onError={() => markBroken(thumbnail.dataUrl)}
						src={thumbnail.dataUrl}
					/>
				)}
			</div>
		</div>
	);
}
