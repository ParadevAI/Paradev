import type { AnyMessage, Stream } from "@agentclientprotocol/sdk";
import type { WebSocket } from "ws";

/** ACP over a server-side `ws` socket: one JSON-RPC message per text frame, as the ACP websocket client sends them. */
export function socketStream(socket: WebSocket): Stream {
	const readable = new ReadableStream<AnyMessage>({
		start(controller) {
			socket.on("message", (data) => {
				try {
					controller.enqueue(JSON.parse(String(data)) as AnyMessage);
				} catch {
					socket.close(1007, "invalid JSON");
				}
			});
			socket.on("close", () => {
				try {
					controller.close();
				} catch {
					// Already closed by an error.
				}
			});
			socket.on("error", (err) => controller.error(err));
		},
	});
	const writable = new WritableStream<AnyMessage>({
		write(message) {
			if (socket.readyState === socket.OPEN)
				socket.send(JSON.stringify(message));
		},
		close() {
			socket.close();
		},
	});
	return { readable, writable };
}
