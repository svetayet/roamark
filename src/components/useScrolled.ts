import { useEffect, useState } from 'react';

/**
 * true, когда страницу прокрутили вниз. Липкой шапке и строке районов
 * нужен нижний разделитель только тогда, когда под ними реально что-то проезжает.
 */
export function useScrolled(threshold = 2): boolean {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > threshold);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [threshold]);
  return scrolled;
}
