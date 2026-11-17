import { FaceAvatar } from "renderer/routes/_authenticated/_dashboard/components/FaceAvatar";
import { useChats } from "../../hooks/useChats";
import { listingFace } from "../../utils/listingFace";

interface DevFaceProps {
	devId: string;
	size: number;
	className?: string;
}

/** A Dev's face: its listing's when it came from the directory, else its own. */
export function DevFace({ devId, size, className }: DevFaceProps) {
	const slug = useChats()?.state?.devs[devId]?.listing?.slug;
	return slug ? (
		<FaceAvatar face={listingFace(slug)} size={size} className={className} />
	) : (
		<FaceAvatar seed={devId} size={size} className={className} />
	);
}
