import type { Page } from '@playwright/test';

export interface QaAnimationRecord {
  readonly constructorName: string;
  readonly target: string;
  readonly pseudoElement: string;
  readonly properties: readonly string[];
  readonly duration: number | string;
  readonly iterations: number | string;
  readonly easing: string;
  readonly keyframeEasings: readonly string[];
  readonly startTime?: number | null;
  readonly classes?: readonly string[];
  readonly dataAttrs?: readonly string[];
}

export interface QaStyleChangeRecord {
  readonly element: string;
  readonly property: string;
  readonly value: string;
  readonly timestamp: number;
}

export interface SamplingResult {
  readonly animations: readonly QaAnimationRecord[];
  readonly styleChanges: readonly QaStyleChangeRecord[];
}

export interface TweenedProperty {
  readonly element: string;
  readonly property: string;
  readonly changeCount: number;
}

export const MOTION_SAMPLER_SCRIPT = `
(function() {
  if (window.__qaSamplerInstalled) return;
  window.__qaSamplerInstalled = true;
  window.__qaSampling = false;
  window.__qaAnimations = [];
  window.__qaStyleChanges = [];
  window.__qaSeenAnimations = new WeakSet();

  function describeElement(el) {
    if (!el || !(el instanceof Element)) return 'unknown';
    var desc = el.tagName.toLowerCase();
    if (el.id) desc += '#' + el.id;
    if (el.className && typeof el.className === 'string') {
      var cls = el.className.trim().split(/\\s+/).filter(Boolean);
      if (cls.length) desc += '.' + cls.join('.');
    }
    for (var i = 0; i < el.attributes.length; i++) {
      var attr = el.attributes[i];
      if (attr.name.startsWith('data-')) {
        desc += '[' + attr.name + '="' + attr.value + '"]';
      }
    }
    return desc;
  }

  function parseStyle(str) {
    var res = {};
    if (!str) return res;
    var parts = str.split(';');
    for (var i = 0; i < parts.length; i++) {
      var idx = parts[i].indexOf(':');
      if (idx > 0) {
        var k = parts[i].slice(0, idx).trim();
        var v = parts[i].slice(idx + 1).trim();
        if (k && v) res[k] = v;
      }
    }
    return res;
  }

  var observer = new MutationObserver(function(mutations) {
    if (!window.__qaSampling) return;
    var now = performance.now();
    for (var i = 0; i < mutations.length; i++) {
      var m = mutations[i];
      if (m.type === 'attributes' && m.attributeName === 'style' && m.target instanceof Element) {
        var elDesc = describeElement(m.target);
        var oldMap = parseStyle(m.oldValue);
        var newMap = parseStyle(m.target.getAttribute('style'));

        for (var p in newMap) {
          if (newMap[p] !== oldMap[p]) {
            window.__qaStyleChanges.push({
              element: elDesc,
              property: p,
              value: newMap[p],
              timestamp: now,
            });
          }
        }
        for (var op in oldMap) {
          if (!(op in newMap)) {
            window.__qaStyleChanges.push({
              element: elDesc,
              property: op,
              value: '',
              timestamp: now,
            });
          }
        }
      }
    }
  });

  function startObserver() {
    if (document.documentElement) {
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['style'],
        attributeOldValue: true,
        subtree: true,
      });
    } else {
      document.addEventListener('DOMContentLoaded', function() {
        observer.observe(document.documentElement, {
          attributes: true,
          attributeFilter: ['style'],
          attributeOldValue: true,
          subtree: true,
        });
      });
    }
  }
  startObserver();

  window.__qaSampleLoop = function() {
    if (!window.__qaSampling) return;
    try {
      var anims = document.getAnimations ? document.getAnimations() : [];
      for (var i = 0; i < anims.length; i++) {
        var anim = anims[i];
        if (window.__qaSeenAnimations.has(anim)) continue;
        window.__qaSeenAnimations.add(anim);

        var cName = anim.constructor ? anim.constructor.name : 'Animation';
        var effect = anim.effect;
        var targetDesc = effect && effect.target ? describeElement(effect.target) : 'unknown';
        var pseudo = (effect && effect.pseudoElement) || '';
        var classes = [];
        var dataAttrs = [];
        var targetEl = effect && effect.target;
        if (targetEl && targetEl.nodeType === 1) {
          if (targetEl.classList) {
            for (var c = 0; c < targetEl.classList.length; c++) {
              classes.push(targetEl.classList[c]);
            }
          }
          if (targetEl.attributes) {
            for (var a = 0; a < targetEl.attributes.length; a++) {
              var attr = targetEl.attributes[a];
              if (attr && attr.name && attr.name.indexOf('data-') === 0) {
                dataAttrs.push(attr.name);
              }
            }
          }
        }
        var props = [];
        var kfEasings = [];

        if (cName === 'CSSTransition' && anim.transitionProperty) {
          props = [anim.transitionProperty];
        } else if (effect && typeof effect.getKeyframes === 'function') {
          var kfs = effect.getKeyframes();
          var propSet = {};
          var excluded = { offset: 1, easing: 1, composite: 1, computedOffset: 1 };
          for (var k = 0; k < kfs.length; k++) {
            var kf = kfs[k];
            if (kf.easing) kfEasings.push(kf.easing);
            for (var propKey in kf) {
              if (!excluded[propKey]) propSet[propKey] = true;
            }
          }
          props = Object.keys(propSet);
        }

        var timing = effect && typeof effect.getTiming === 'function' ? effect.getTiming() : {};
        var dur = timing.duration !== undefined ? timing.duration : 0;
        var iters = timing.iterations !== undefined ? timing.iterations : 1;
        var easing = timing.easing || 'linear';

        window.__qaAnimations.push({
          constructorName: cName,
          target: targetDesc,
          pseudoElement: pseudo,
          properties: props,
          duration: dur,
          iterations: iters,
          easing: easing,
          keyframeEasings: kfEasings,
          startTime: anim.startTime,
          classes: classes,
          dataAttrs: dataAttrs,
        });
      }
    } catch {
      // Ignore inspection errors
    }
    requestAnimationFrame(window.__qaSampleLoop);
  };
})();
`;

/**
 * Attaches the motion sampler script to a page or context.
 */
export async function attachMotionSampler(page: Page): Promise<void> {
  await page.addInitScript(MOTION_SAMPLER_SCRIPT);
}

/**
 * Starts motion sampling on the page.
 */
export async function startSampling(page: Page): Promise<void> {
  await page.evaluate(MOTION_SAMPLER_SCRIPT);
  await page.evaluate(() => {
    type SamplingWindow = typeof window & {
      __qaSampling: boolean;
      __qaSampleLoop: () => void;
    };
    const win = window as unknown as SamplingWindow;
    win.__qaSampling = true;
    win.__qaSampleLoop();
  });
}

/**
 * Stops motion sampling on the page and returns all collected animations and style changes.
 */
export async function stopSampling(page: Page): Promise<SamplingResult> {
  return await page.evaluate(() => {
    type SamplingWindow = typeof window & {
      __qaSampling: boolean;
      __qaAnimations: QaAnimationRecord[];
      __qaStyleChanges: QaStyleChangeRecord[];
    };
    const win = window as unknown as SamplingWindow;
    win.__qaSampling = false;
    return {
      animations: win.__qaAnimations || [],
      styleChanges: win.__qaStyleChanges || [],
    };
  });
}

/**
 * Evaluates whether a list of style changes constitutes a "tween" (>= 3 changes within 500ms).
 */
export function isTweened(changes: readonly QaStyleChangeRecord[]): boolean {
  if (changes.length < 3) return false;
  const sorted = [...changes].sort((a, b) => a.timestamp - b.timestamp);
  for (let i = 0; i <= sorted.length - 3; i++) {
    if (sorted[i + 2].timestamp - sorted[i].timestamp <= 500) {
      return true;
    }
  }
  return false;
}

/**
 * Groups style changes by element + property and returns those that were tweened.
 */
export function getTweenedProperties(result: SamplingResult): TweenedProperty[] {
  const groups = new Map<string, QaStyleChangeRecord[]>();
  for (const c of result.styleChanges) {
    const key = `${c.element}:::${c.property}`;
    let list = groups.get(key);
    if (!list) {
      list = [];
      groups.set(key, list);
    }
    list.push(c);
  }

  const tweened: TweenedProperty[] = [];
  for (const [key, list] of groups.entries()) {
    if (isTweened(list)) {
      const [element, property] = key.split(':::');
      tweened.push({ element, property, changeCount: list.length });
    }
  }
  return tweened;
}
