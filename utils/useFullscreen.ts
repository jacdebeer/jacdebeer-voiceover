import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Full-screen for a window: the browser's Fullscreen API on the given element when it exists, and a layout that fills the
 * page either way (so it also works where the API is blocked). Escape leaves it.
 */
export function useFullscreen<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [full, setFull] = useState(false);

  useEffect(() => {
    const onChange = () => { if (!document.fullscreenElement) setFull(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setFull(false); };
    document.addEventListener('fullscreenchange', onChange);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      window.removeEventListener('keydown', onKey);
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    };
  }, []);

  const toggle = useCallback(async () => {
    const next = !full;
    setFull(next);
    try {
      if (next && ref.current?.requestFullscreen && !document.fullscreenElement) await ref.current.requestFullscreen();
      else if (!next && document.fullscreenElement) await document.exitFullscreen();
    } catch { /* the page layout still fills the screen */ }
  }, [full]);

  return { ref, full, toggle };
}
