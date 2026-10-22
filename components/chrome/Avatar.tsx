'use client';
import { useState } from 'react';
import { useUser } from '@/stores/user';
import { initials } from '../icons';

export function Avatar({ name, className = '' }: { name?: string | null; className?: string }) {
  const photo = useUser((s) => s.photoURL ?? s.user?.photoURL);
  const [broken, setBroken] = useState(false);
  return (
    <span className={`avatar ${className}`} aria-hidden="true">
      {photo && !broken ? <img src={photo} alt="" referrerPolicy="no-referrer" onError={() => setBroken(true)} /> : initials(name)}
    </span>
  );
}
