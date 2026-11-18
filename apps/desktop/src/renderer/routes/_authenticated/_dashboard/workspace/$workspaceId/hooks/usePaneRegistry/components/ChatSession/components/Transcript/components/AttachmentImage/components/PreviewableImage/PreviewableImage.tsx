import { useLingui } from "@lingui/react/macro";
import type { Ref } from "react";

export function PreviewableImage({
	alt,
	src,
	filename,
	onClick,
	onError,
	ref,
}: {
	src: string;
	filename: string;
	alt?: string | undefined;
	onClick: () => void;
	onError: () => void;
	ref?: Ref<HTMLButtonElement>;
}) {
	const { t } = useLingui();
	return (
		<button
			type="button"
			aria-label={t({ message: `Preview ${filename}` })}
			className="block size-40 cursor-zoom-in overflow-hidden rounded-2xl"
			onClick={onClick}
			ref={ref}
		>
			<img
				alt={alt ?? filename}
				className="size-full object-cover"
				draggable={false}
				onError={onError}
				src={src}
			/>
		</button>
	);
}
