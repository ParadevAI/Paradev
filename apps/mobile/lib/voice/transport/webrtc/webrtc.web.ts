// react-native-webrtc plays remote audio itself; a browser needs an element.
class PlayingPeerConnection extends RTCPeerConnection {
	private readonly audio = new Audio();

	constructor(configuration?: RTCConfiguration) {
		super(configuration);
		this.audio.autoplay = true;
		this.addEventListener("track", (event) => {
			this.audio.srcObject = event.streams[0] ?? new MediaStream([event.track]);
		});
	}

	override close(): void {
		this.audio.srcObject = null;
		super.close();
	}
}

export type MediaStream = globalThis.MediaStream;
export type MediaStreamTrack = globalThis.MediaStreamTrack;

export const mediaDevices = navigator.mediaDevices;

export { PlayingPeerConnection as RTCPeerConnection };
export const RTCSessionDescription = globalThis.RTCSessionDescription;
