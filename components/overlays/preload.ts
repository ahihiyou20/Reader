export const preloadExplore = () => import('./ExplorePanel');
export const preloadSearch = () => import('./SearchPanel');
export const preloadSocial = () => import('./SocialPanels');
export const preloadProfile = () => import('./ProfilePanel');
export const preloadCreate = () => import('./CreatePanel');
export const preloadLibrary = () => import('./LibraryPanel');
export const preloadSettings = () => import('./SettingsPanel');
export const preloadSheets = () => import('./Sheets');
export const preloadBigHeart = () => import('../chrome/BigHeart');

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
