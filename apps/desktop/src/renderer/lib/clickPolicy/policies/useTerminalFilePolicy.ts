import { FILE_LINK_PLAIN_DEFAULT } from "./agentOutputLinks";
import { type ClickPolicy, usePolicy } from "./policy";

export function useTerminalFilePolicy(): ClickPolicy {
	return usePolicy("fileLinks", "file", "4-tier", FILE_LINK_PLAIN_DEFAULT);
}
