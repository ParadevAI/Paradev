import type {
	FrameMessage,
	HostMessageBody,
} from "@superset/shared/page-comments-runtime";

export interface PageFrameHandle {
	send: (message: HostMessageBody) => void;
	reload: () => void;
}

export interface PageFrameProps {
	src: string;
	insetTop: number;
	onMessage: (message: FrameMessage) => void;
	onLoadEnd: () => void;
	onError: () => void;
}
