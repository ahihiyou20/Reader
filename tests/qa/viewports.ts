import { stageOf, type Stage } from '@/lib/stage';

export interface QaViewport {
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly isMobile: boolean;
  readonly hasTouch: boolean;
  readonly stage: Stage;
}

const RAW = [
  { name: 'iphone-portrait', width: 390, height: 844, isMobile: true, hasTouch: true },
  { name: 'iphone-landscape', width: 844, height: 390, isMobile: true, hasTouch: true },
  { name: 'se-portrait', width: 375, height: 667, isMobile: true, hasTouch: true },
  { name: 'se-landscape', width: 667, height: 375, isMobile: true, hasTouch: true },
  { name: 'ipad-portrait', width: 820, height: 1180, isMobile: true, hasTouch: true },
  { name: 'ipad-landscape', width: 1180, height: 820, isMobile: true, hasTouch: true },
  { name: 'desktop', width: 1440, height: 900, isMobile: false, hasTouch: false },
  { name: 'desktop-wide', width: 1920, height: 1080, isMobile: false, hasTouch: false },
] as const;

export const MATRIX: readonly QaViewport[] = RAW.map((vp) => ({
  ...vp,
  stage: stageOf(vp.width, vp.height),
}));
