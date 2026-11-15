export const preloadExplore = () => import('./ExplorePanel');
export const preloadSearch = () => import('./SearchPanel');
export const preloadSocial = () => import('./SocialPanels');
export const preloadProfile = () => import('./ProfilePanel');
export const preloadCreate = () => import('./CreatePanel');
export const preloadLibrary = () => import('./LibraryPanel');
export const preloadSettings = () => import('./SettingsPanel');
export const preloadSheets = () => import('./Sheets');
export const preloadBigHeart = () => import('../chrome/BigHeart');

/**
 * Fetch card images while the page is idle, a few at a time and at low priority, so Explore, the
 * Library and the menu open on pictures instead of empty cards.
 */
export function warmCovers(urls: string[]) {
  const queue = [...new Set(urls.filter(Boolean))];
  const idle = (fn: () => void) => ('requestIdleCallback' in window ? window.requestIdleCallback(fn, { timeout: 3000 }) : setTimeout(fn, 200));
  const next = () => {
    const batch = queue.splice(0, 6);
    if (!batch.length) return;
    let left = batch.length;
    for (const src of batch) {
      const img = new Image();
      img.decoding = 'async';
      img.fetchPriority = 'low';
      img.onload = img.onerror = () => --left === 0 && idle(next);
      img.src = src;
    }
  };
  idle(next);
}

export const preloadOverlays = () => {
  preloadExplore();
  preloadSearch();
  preloadSocial();
  preloadProfile();
  preloadCreate();
  preloadLibrary();
  preloadSettings();
  preloadSheets();
  preloadBigHeart();
};
