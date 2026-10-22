'use client';
import { BellRing, UserRound, Users } from 'lucide-react';
import { useUI } from '@/stores/ui';
import { useT } from '../hooks';
import { Panel } from './Layer';

/** SCR-06 / CMP-21: Messages, like the original app's MVP — the panel and its empty state. */
export function MessagesPanel() {
  const t = useT();
  const open = useUI((s) => s.overlays.includes('messages'));
  const closeOverlay = useUI((s) => s.closeOverlay);
  return (
    <Panel open={open} onClose={() => closeOverlay('messages')} label={t('messages')} className="msgs" closeIcon="none">
      <div className="mhead">
        <button className="cb iconbtn" type="button" aria-label={t('back')} onClick={() => closeOverlay('messages')}>
          <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>
        <div className="mpill">
          <span>{t('messages')}</span>
          <i aria-hidden="true" />
        </div>
        <button className="tb-ic" type="button" aria-label={t('friends')}>
          <Users className="ic" style={{ width: 26, height: 26 }} aria-hidden="true" />
        </button>
      </div>
      <div className="mempty">
        <div className="mav" aria-hidden="true">
          <UserRound className="ic" />
        </div>
        <span>{t('noConv')}</span>
        <small>{t('noConvSub')}</small>
      </div>
    </Panel>
  );
}

/** SCR-10 / FR-27: the bell opens an empty list in this version. */
export function NotificationsPanel() {
  const t = useT();
  const open = useUI((s) => s.overlays.includes('notifications'));
  const closeOverlay = useUI((s) => s.closeOverlay);
  return (
    <Panel open={open} onClose={() => closeOverlay('notifications')} label={t('notifications')} title={t('notifications')}>
      <div className="pbody">
        <div className="mempty" style={{ top: '38%' }}>
          <div className="mav" aria-hidden="true">
            <BellRing className="ic" />
          </div>
          <span>{t('caughtUp')}</span>
          <small>{t('caughtUpSub')}</small>
        </div>
      </div>
    </Panel>
  );
}
