import Image from "next/image";

export function DmgWindowArt() {
	return (
		<div className="relative size-full bg-[#1d1e21]">
			<Image
				src="/download/dmg-window.webp"
				alt=""
				fill
				sizes="(min-width: 768px) 30vw, 90vw"
				className="object-cover"
			/>
		</div>
	);
}
