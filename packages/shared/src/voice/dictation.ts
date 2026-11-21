/** Fits the API host's 4.5 MB request body limit once base64-encoded. */
export const DICTATION_MAX_AUDIO_BYTES = 3 * 1024 * 1024;
export const DICTATION_MAX_SECONDS = 10 * 60;
/** Clear for speech, and DICTATION_MAX_SECONDS of it fits DICTATION_MAX_AUDIO_BYTES. */
export const DICTATION_AUDIO_BITS_PER_SECOND = 32_000;
