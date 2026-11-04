export const preloadExplore = () => import('./ExplorePanel');
export const preloadSearch = () => import('./SearchPanel');
export const preloadSocial = () => import('./SocialPanels');
export const preloadProfile = () => import('./ProfilePanel');
export const preloadCreate = () => import('./CreatePanel');
export const preloadSheets = () => import('./Sheets');
export const preloadBigHeart = () => import('../chrome/BigHeart');

export const preloadOverlays = () => {
  preloadExplore();
  preloadSearch();
  preloadSocial();
  preloadProfile();
  preloadCreate();
  preloadSheets();
  preloadBigHeart();
};
