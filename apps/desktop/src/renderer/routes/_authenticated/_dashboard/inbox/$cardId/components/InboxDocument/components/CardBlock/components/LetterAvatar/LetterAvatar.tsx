import { cn } from "@superset/ui/utils";
import { useState } from "react";

const PALETTE = [
	"bg-[#5c6bc0]",
	"bg-[#26a69a]",
	"bg-[#ef6c00]",
	"bg-[#8e24aa]",
	"bg-[#d81b60]",
	"bg-[#43a047]",
	"bg-[#1e88e5]",
	"bg-[#6d4c41]",
];

function hash(value: string): number {
	let h = 0;
	for (const char of value) h = (h * 31 + char.charCodeAt(0)) | 0;
	return Math.abs(h);
}

interface LetterAvatarProps {
	address: { name: string | null; email: string };
	photo?: string | null;
	className?: string;
}

/** The sender's photo, or Gmail's round initial colored by their address when there is none or it fails to load. */
export function LetterAvatar({ address, photo, className }: LetterAvatarProps) {
	const [failed, setFailed] = useState<string | null>(null);
	if (photo && failed !== photo) {
		return (
			<img
				src={photo}
				alt=""
				aria-hidden
				referrerPolicy="no-referrer"
				onError={() => setFailed(photo)}
				className={cn(
					"size-10 shrink-0 select-none rounded-full object-cover",
					className,
				)}
			/>
		);
	}
	const letter = (address.name ?? address.email).trim().charAt(0).toUpperCase();
	return (
		<span
			aria-hidden
			className={cn(
				"flex size-10 shrink-0 select-none items-center justify-center rounded-full text-base font-medium text-white",
				PALETTE[hash(address.email.toLowerCase()) % PALETTE.length],
				className,
			)}
		>
			{letter}
		</span>
	);
}
