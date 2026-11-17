import { createServer, type Server } from "node:http";
import { WebSocketServer } from "ws";
import { serveAcp } from "../acp/acp-agent.ts";
import { ACP_PROTOCOL, type Grant, tokenFromProtocols } from "../auth/auth.ts";
import { socketStream } from "../socket-stream/socket-stream.ts";
import {
	statusRequest,
	type TurnHttpOptions,
	turnRequests,
} from "../turn-http/turn-http.ts";

export interface RunnerServerOptions extends TurnHttpOptions {
	port: number;
}

/**
 * The box's only listener: `GET /health` for the server's wake check, `POST /turns`, `/turns/cancel` and `/turns/steer` for the
 * server to run turns, `GET /status` for whether background work keeps it busy, and the ACP websocket at `/acp` for
 * watchers. The box's port is public on Vercel, so every one
 * but `/health` is refused (401) unless it carries a valid token for this box.
 */
export function startRunnerServer(opts: RunnerServerOptions): Promise<Server> {
	const wss = new WebSocketServer({
		noServer: true,
		handleProtocols: () => ACP_PROTOCOL,
	});
	const handleTurnRequest = turnRequests(opts);
	const handleStatus = statusRequest(opts);
	const server = createServer((req, res) => {
		if (req.url === "/health") {
			res
				.writeHead(200, { "content-type": "application/json" })
				.end('{"ok":true}');
			return;
		}
		if (req.url === "/status") {
			handleStatus(req, res).catch((err: unknown) => {
				console.error("dev-runner: status request failed:", err);
				if (!res.headersSent) res.writeHead(500).end();
			});
			return;
		}
		if (
			req.url === "/turns" ||
			req.url === "/turns/cancel" ||
			req.url === "/turns/steer"
		) {
			handleTurnRequest(req, res, req.url).catch((err: unknown) => {
				console.error("dev-runner: turn request failed:", err);
				if (!res.headersSent) res.writeHead(500).end();
			});
			return;
		}
		res.writeHead(404).end();
	});

	server.on("upgrade", async (req, socket, head) => {
		const refuse = (status: number, text: string) => {
			socket.end(
				`HTTP/1.1 ${status} ${text}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`,
			);
		};
		if (new URL(req.url ?? "/", "http://box").pathname !== "/acp")
			return refuse(404, "Not Found");
		const token = tokenFromProtocols(req.headers["sec-websocket-protocol"]);
		if (!token) return refuse(401, "Unauthorized");
		let grant: Grant;
		try {
			grant = await opts.verify(token);
		} catch {
			return refuse(401, "Unauthorized");
		}
		wss.handleUpgrade(req, socket, head, (ws) =>
			serveAcp(socketStream(ws), { grant, hub: opts.hub }),
		);
	});

	return new Promise((resolve) =>
		server.listen(opts.port, () => resolve(server)),
	);
}
