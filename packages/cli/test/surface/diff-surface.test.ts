import { describe, expect, it } from "bun:test";
import type { CliSurface, SurfaceCommand } from "../../scripts/cli-surface";
import { diffSurface } from "./diff-surface";

function surface(commands: Record<string, SurfaceCommand>): CliSurface {
	return { globalOptions: [], commands };
}

const read: SurfaceCommand = {
	runnable: true,
	aliases: ["r"],
	options: [
		{ name: "workspace", aliases: ["w"], type: "string", required: true },
		{
			name: "format",
			aliases: [],
			type: "string",
			required: false,
			default: "text",
			enum: ["text", "json"],
		},
	],
	args: [{ name: "id", required: false }],
};

describe("diffSurface", () => {
	it("reports a renamed flag as a removal next to the flag that replaced it", () => {
		const renamed = {
			...read,
			options: [
				{
					...(read.options[0] as SurfaceCommand["options"][number]),
					name: "ws",
				},
				...read.options.slice(1),
			],
		};
		expect(
			diffSurface(
				surface({ "terminals read": read }),
				surface({ "terminals read": renamed }),
			),
		).toEqual({
			breaking: [
				"terminals read --workspace: removed (added on this command: --ws)",
				"terminals read --ws: added as required",
			],
			additions: [],
		});
	});

	it("reports lost aliases, enum values, defaults and required positionals", () => {
		const narrowed: SurfaceCommand = {
			runnable: true,
			options: [
				{ name: "workspace", aliases: [], type: "string", required: true },
				{
					name: "format",
					aliases: [],
					type: "string",
					required: false,
					enum: ["json"],
				},
			],
			args: [{ name: "id", required: true }],
		};
		expect(
			diffSurface(
				surface({ "terminals read": read }),
				surface({ "terminals read": narrowed }),
			).breaking,
		).toEqual([
			"terminals read: lost alias r",
			"terminals read --workspace: lost alias w",
			'terminals read --format: default "text" -> undefined',
			"terminals read --format: lost value text",
			"terminals read <id> (position 1): became required",
		]);
	});

	it("reports a path that stops being runnable and records one that becomes runnable", () => {
		const group: SurfaceCommand = { runnable: false, options: [], args: [] };
		expect(
			diffSurface(
				surface({ tasks: { ...group, runnable: true }, hosts: group }),
				surface({
					tasks: group,
					hosts: { ...group, runnable: true, aliases: ["h"] },
				}),
			),
		).toEqual({
			breaking: ["tasks: no longer runnable"],
			additions: ["hosts: now runnable", "hosts: added alias h"],
		});
	});

	it("reports a removed command and keeps new commands and optional flags as additions", () => {
		const grown: SurfaceCommand = {
			...read,
			options: [
				...read.options,
				{ name: "lines", aliases: [], type: "number", required: false },
			],
		};
		expect(
			diffSurface(
				surface({ "terminals read": read, "terminals list": read }),
				surface({ "terminals read": grown, "terminals ls": read }),
			),
		).toEqual({
			breaking: ["terminals list: removed (added beside it: terminals ls)"],
			additions: ["terminals read --lines: added", "terminals ls: added"],
		});
	});
});
