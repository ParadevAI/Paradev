import { cn } from "@superset/ui/utils";
import { hashString } from "../../utils/hashString";
import { FACES, type Face } from "./constants";

export function faceFor(seed: string): Face {
	return FACES[hashString(seed) % FACES.length] as Face;
}

type FaceAvatarProps = {
	size: number;
	className?: string;
} & (
	| {
			/** A stable id; the same seed always gets the same face. */
			seed: string;
	  }
	| { face: Face }
);

export function FaceAvatar({ size, className, ...which }: FaceAvatarProps) {
	const face = "face" in which ? which.face : faceFor(which.seed);
	const [x1, y1, x2, y2] = face.eyes;
	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 100 100"
			aria-hidden="true"
			className={cn("shrink-0", className)}
			style={{ borderRadius: size * 0.24 }}
		>
			<rect width="100" height="100" fill={face.tile} />
			<path d={face.d} fill={face.shape} />
			<circle cx={x1} cy={y1} r="5.2" fill={face.tile} />
			<circle cx={x2} cy={y2} r="5.2" fill={face.tile} />
		</svg>
	);
}
