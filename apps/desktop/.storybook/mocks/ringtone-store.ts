/**
 * Stands in for renderer/stores/ringtone under Storybook. The real store reads
 * the chosen ringtone from the main process when it loads; here it keeps the
 * default in memory.
 */
import { create } from "zustand";
import {
	DEFAULT_RINGTONE_ID,
	RINGTONES,
	type RingtoneData,
} from "../../src/shared/ringtones";

export type Ringtone = RingtoneData;
export const AVAILABLE_RINGTONES = RINGTONES;
export { DEFAULT_RINGTONE_ID };

interface RingtoneState {
	selectedRingtoneId: string;
	setRingtone: (ringtoneId: string) => void;
	getSelectedRingtone: () => Ringtone;
}

export const useRingtoneStore = create<RingtoneState>()((set, get) => ({
	selectedRingtoneId: DEFAULT_RINGTONE_ID,
	setRingtone: (ringtoneId) => set({ selectedRingtoneId: ringtoneId }),
	getSelectedRingtone: () =>
		(AVAILABLE_RINGTONES.find((r) => r.id === get().selectedRingtoneId) ??
			AVAILABLE_RINGTONES[0]) as Ringtone,
}));

export const useSelectedRingtoneId = () =>
	useRingtoneStore((state) => state.selectedRingtoneId);
export const useSetRingtone = () =>
	useRingtoneStore((state) => state.setRingtone);
