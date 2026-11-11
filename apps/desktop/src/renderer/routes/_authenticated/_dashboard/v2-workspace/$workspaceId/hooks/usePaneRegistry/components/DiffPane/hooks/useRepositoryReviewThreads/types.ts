import type { DiffLineAnnotation } from "@pierre/diffs/react";
import type { useReviewThreadActions } from "renderer/routes/_authenticated/_dashboard/pull-requests/hooks/useReviewThreadActions";
import type { DiffAnnotationMetadata } from "../useDiffAnnotations";

export interface RepositoryReviewThreads {
	annotationsByPath: ReadonlyMap<
		string,
		DiffLineAnnotation<DiffAnnotationMetadata>[]
	>;
	actions: ReturnType<typeof useReviewThreadActions>;
}
