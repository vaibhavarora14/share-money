/**
 * Scroll Animation Hook
 * Triggers fade-in animation when element enters viewport
 */
import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';

export function useScrollAnimation(): { ref: RefObject<HTMLElement | null>; isVisible: boolean } {
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(element);

    return () => observer.disconnect();
  }, []);

  return { ref, isVisible };
}

