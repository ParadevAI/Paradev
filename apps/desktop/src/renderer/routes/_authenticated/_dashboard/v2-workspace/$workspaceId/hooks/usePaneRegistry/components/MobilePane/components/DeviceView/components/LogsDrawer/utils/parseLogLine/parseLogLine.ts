import { z } from "zod";

export type LogLevel = "debug" | "info" | "default" | "error" | "fault";

export interface LogEntry {
	id: string;
	time: string;
	process: string;
	level: LogLevel;
	message: string;
}

const IOS_LEVELS: Record<string, LogLevel> = {
	Debug: "debug",
	Info: "info",
	Default: "default",
	Error: "error",
	Fault: "fault",
};

const iosLogEventSchema = z.object({
	timestamp: z.string().optional(),
	processImagePath: z.string().optional(),
	messageType: z.string().optional(),
	eventMessage: z.string().min(1),
});

const androidLogBatchSchema = z.object({
	lines: z.array(z.object({ line: z.string() })),
});

function parseJson(data: string): unknown {
	try {
		return JSON.parse(data);
	} catch {
		return null;
	}
}

export function parseIosEvent(data: string, id: string): LogEntry | null {
	const parsed = iosLogEventSchema.safeParse(parseJson(data));
	if (!parsed.success) return null;
	const event = parsed.data;
	return {
		id,
		time: event.timestamp?.split(" ")[1]?.slice(0, 12) ?? "",
		process: event.processImagePath?.split("/").at(-1) ?? "",
		level: IOS_LEVELS[event.messageType ?? ""] ?? "default",
		message: event.eventMessage,
	};
}

const ANDROID_LEVELS: Record<string, LogLevel> = {
	V: "debug",
	D: "debug",
	I: "info",
	W: "default",
	E: "error",
	F: "fault",
};

const LOGCAT_LINE =
	/^\d\d-\d\d (\d\d:\d\d:\d\d\.\d{3})\s+\d+\s+\d+ ([VDIWEF]) (.*?)\s*: (.*)$/;

export function parseAndroidBatch(
	data: string,
	nextId: () => string,
): LogEntry[] {
	const parsed = androidLogBatchSchema.safeParse(parseJson(data));
	if (!parsed.success) return [];
	return parsed.data.lines.map(({ line }) => parseAndroidLine(line, nextId()));
}

export function parseAndroidLine(line: string, id: string): LogEntry {
	const match = LOGCAT_LINE.exec(line);
	if (!match) {
		return { id, time: "", process: "", level: "default", message: line };
	}
	const [, time = "", level = "", tag = "", message = ""] = match;
	return {
		id,
		time,
		process: tag,
		level: ANDROID_LEVELS[level] ?? "default",
		message,
	};
}
