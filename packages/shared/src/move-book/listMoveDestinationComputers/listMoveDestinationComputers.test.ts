import { describe, expect, test } from "bun:test";
import { listMoveDestinationComputers } from "./listMoveDestinationComputers";

const host = (machineId: string, isOnline: boolean) => ({
	machineId,
	name: `name-${machineId}`,
	isOnline,
});

const hosts = [
	host("offline", false),
	host("source", true),
	host("this", true),
	host("cloud-box", true),
	host("online", true),
];

describe("listMoveDestinationComputers", () => {
	test("lists this computer first, then other computers online before offline, without the source or cloud boxes", () => {
		const computers = listMoveDestinationComputers({
			hosts,
			fromHostId: "source",
			thisHostId: "this",
			cloudHostIds: new Set(["cloud-box"]),
		});
		expect(computers).toEqual([
			{
				hostId: "this",
				name: "name-this",
				online: true,
				isThisComputer: true,
			},
			{
				hostId: "online",
				name: "name-online",
				online: true,
				isThisComputer: false,
			},
			{
				hostId: "offline",
				name: "name-offline",
				online: false,
				isThisComputer: false,
			},
		]);
	});

	test("leaves out this computer when the workspace is already on it", () => {
		const computers = listMoveDestinationComputers({
			hosts,
			fromHostId: "this",
			thisHostId: "this",
			cloudHostIds: new Set(["cloud-box"]),
		});
		expect(computers.map((computer) => computer.hostId)).toEqual([
			"source",
			"online",
			"offline",
		]);
	});

	test("lists no computer as this one when the caller is not a computer", () => {
		const computers = listMoveDestinationComputers({
			hosts,
			fromHostId: "source",
			thisHostId: null,
			cloudHostIds: new Set(["cloud-box"]),
		});
		expect(
			computers.map(({ hostId, isThisComputer }) => [hostId, isThisComputer]),
		).toEqual([
			["this", false],
			["online", false],
			["offline", false],
		]);
	});

	test("lists this computer with no name before the roster knows it", () => {
		const [first] = listMoveDestinationComputers({
			hosts: [],
			fromHostId: "source",
			thisHostId: "unregistered",
			cloudHostIds: new Set(),
		});
		expect(first).toEqual({
			hostId: "unregistered",
			name: null,
			online: true,
			isThisComputer: true,
		});
	});
});
