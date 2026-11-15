// Language change: a band of colour sweeps across the screen, the words change while it covers
// everything, then it moves on and uncovers the screen in the new language.
import { prefersReducedMotion } from '@/lib/motion';

const EASE = 'cubic-bezier(0.65, 0, 0.35, 1)';
let running: Promise<void> | null = null;

export async function wipe(label: string, update: () => void): Promise<void> {
  if (prefersReducedMotion() || typeof document === 'undefined') return update();
  // A second change while one runs waits for it, so two bands never cross.
  if (running) await running;
  const band = document.createElement('div');
  band.className = 'lang-wipe';
  band.setAttribute('aria-hidden', 'true');
  const name = document.createElement('span');
  name.textContent = label;
  band.append(name);
  document.body.append(band);
  running = (async () => {
    try {
      await band.animate([{ transform: 'translateX(-102%)' }, { transform: 'translateX(0)' }], { duration: 360, easing: EASE, fill: 'forwards' }).finished;
      update();
      await name.animate([{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }], { duration: 220, easing: 'ease-out', fill: 'forwards' }).finished;
      await band.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(102%)' }], { duration: 420, easing: EASE, fill: 'forwards' }).finished;
    } catch {
      update();
    } finally {
      band.remove();
      running = null;
    }
  })();
  return running;
}
