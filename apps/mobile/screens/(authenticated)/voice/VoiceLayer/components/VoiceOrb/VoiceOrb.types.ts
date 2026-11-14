import type { ComponentType } from "react";
import type { VoiceStatus } from "@/lib/voice/voiceStore";

export interface VoiceOrbProps {
	status: VoiceStatus;
	size: number;
}

/** The voice persona: idle, listening, thinking or speaking. */
export type VoiceOrbComponent = ComponentType<VoiceOrbProps>;
