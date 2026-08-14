import { useFontScaleStore, FONT_SCALE_VALUES } from '../store/fontScaleStore';

export function useFontScale(): number {
  const mode = useFontScaleStore((s) => s.mode);
  return FONT_SCALE_VALUES[mode];
}
