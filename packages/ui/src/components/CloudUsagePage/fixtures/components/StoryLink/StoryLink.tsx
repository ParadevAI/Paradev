import type { CloudUsageLink } from "../../../types";

/** A link to a hash only, so a story stays on its state. */
export const StoryLink: CloudUsageLink = ({ to: _, ...props }) => (
	<a href="#cloud-usage" {...props} />
);
