'use client';
import { useEffect, useState } from 'react';
import { useUI } from '@/stores/ui';

export function Toast() {
  const toast = useUI((s) => s.toast);
  const [show, setShow] = useState(false);
  const [text, setText] = useState('');
  useEffect(() => {
    if (!toast?.text) return;
    setText(toast.text);
    setShow(true);
    const id = setTimeout(() => setShow(false), 2400);
    return () => clearTimeout(id);
  }, [toast]);
  return (
    <div className={`toast${show ? ' show' : ''}`} role="status" aria-live="polite">
      {text}
    </div>
  );
}
