import {
	FACES,
	type Face,
	faceFor,
} from "renderer/routes/_authenticated/_dashboard/components/FaceAvatar";

/** The face each ready-made Dev wears, so no two in the directory look alike. */
const LISTING_FACES: Record<string, number> = {
	"eng-lead": 3,
	reviewer: 7,
	researcher: 11,
	"release-notes": 14,
	planner: 17,
};

/** A listing's face: the same in the directory and on every Dev made from it. */
export function listingFace(slug: string): Face {
	const index = LISTING_FACES[slug];
	return (index === undefined ? undefined : FACES[index]) ?? faceFor(slug);
}
