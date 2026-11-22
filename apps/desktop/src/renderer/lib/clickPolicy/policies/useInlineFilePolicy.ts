import { FILE_LINK_PLAIN_DEFAULT } from "./agentOutputLinks";
import { type ClickPolicy, usePolicy } from "./policy";

export function useInlineFilePolicy(): ClickPolicy {
	return usePolicy("fileLinks", "file", "2-tier", FILE_LINK_PLAIN_DEFAULT);
}
