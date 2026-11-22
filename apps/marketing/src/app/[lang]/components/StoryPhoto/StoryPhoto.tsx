import Image from "next/image";
import type { About } from "@/lib/about";

interface StoryPhotoProps {
	photo: About["photos"][number];
	sizes: string;
	className?: string;
}

export function StoryPhoto({ photo, sizes, className = "" }: StoryPhotoProps) {
	return (
		<figure className={`m-0 ${className}`}>
			<div className="relative aspect-[8/5] rounded-lg overflow-hidden bg-muted border border-border">
				<Image
					src={photo.src}
					alt={photo.alt}
					fill
					className="object-cover"
					sizes={sizes}
				/>
			</div>
			<figcaption className="mt-3 text-xs text-muted-foreground">
				{photo.caption}
			</figcaption>
		</figure>
	);
}
