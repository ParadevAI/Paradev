import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";

interface SandboxRow {
	branch: string;
	agent: string;
	size: MessageDescriptor;
	spec: string;
	status: "working" | "review";
}

export const SANDBOX_ROWS: SandboxRow[] = [
	{
		branch: "fix-login-redirect",
		agent: "claude",
		size: msg({ message: "Medium" }),
		spec: "4 vCPU · 8 GB",
		status: "working",
	},
	{
		branch: "migrate-billing-export",
		agent: "codex",
		size: msg({ message: "Large" }),
		spec: "8 vCPU · 16 GB",
		status: "working",
	},
	{
		branch: "triage-flaky-tests",
		agent: "claude",
		size: msg({ message: "Small" }),
		spec: "2 vCPU · 4 GB",
		status: "review",
	},
];
