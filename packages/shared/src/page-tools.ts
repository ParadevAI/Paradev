export const TOOLS_FRAME_CHANNEL = "superset-tools/frame";
export const TOOLS_HOST_CHANNEL = "superset-tools/host";
export const PAGE_TOOL_CALL_TIMEOUT_MS = 60_000;
export const MAX_PAGE_TOOL_NAME_LENGTH = 128;

export type PageToolErrorCode =
	| "needs_install"
	| "needs_connection"
	| "denied"
	| "unavailable_signed_out"
	| "rate_limited"
	| "invalid"
	| "tool_error"
	| "unavailable";

export interface PageToolCallRequest {
	plugin: string;
	tool: string;
	args: Record<string, unknown>;
}

export type PageToolOutcome =
	| { ok: true; result: unknown }
	| { ok: false; code: PageToolErrorCode; message: string };

export type PageToolsFrameMessage =
	| { channel: typeof TOOLS_FRAME_CHANNEL; type: "hello" }
	| {
			channel: typeof TOOLS_FRAME_CHANNEL;
			type: "call";
			id: string;
			request: PageToolCallRequest;
	  };

export type PageToolsUnavailableReason = "signed_out" | "unavailable";

export type PageToolsHostMessage =
	| {
			channel: typeof TOOLS_HOST_CHANNEL;
			type: "ready";
			available: boolean;
			reason?: PageToolsUnavailableReason;
	  }
	| { channel: typeof TOOLS_HOST_CHANNEL; type: "pending"; id: string }
	| ({
			channel: typeof TOOLS_HOST_CHANNEL;
			type: "result";
			id: string;
	  } & PageToolOutcome);

export interface PageToolAccount {
	connectionId: string;
	label: string;
}

export type PageToolServerReply =
	| { status: "ok"; result: unknown }
	| { status: "needs_grant"; pluginLabel: string; accountless?: true }
	| { status: "needs_install"; pluginLabel: string }
	| { status: "needs_connection"; pluginLabel: string; connectUrl: string }
	| {
			status: "needs_account";
			pluginLabel: string;
			accounts: PageToolAccount[];
	  }
	| {
			status: "error";
			code: "rate_limited" | "invalid" | "tool_error" | "unavailable";
			message: string;
	  };
