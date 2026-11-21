import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import type { MachineSize } from "./billing";

export const MACHINE_SIZE_NAMES: Record<MachineSize, MessageDescriptor> = {
	small: msg({ message: "Small", context: "machine size" }),
	medium: msg({ message: "Medium", context: "machine size" }),
	large: msg({ message: "Large", context: "machine size" }),
	xlarge: msg({ message: "X-Large", context: "machine size" }),
	"2xlarge": msg({ message: "2X-Large", context: "machine size" }),
};
