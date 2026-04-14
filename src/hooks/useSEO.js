import { useEffect } from 'react';

const BASE_URL = 'https://redautos.com.uy';
const DEFAULT_IMAGE = `${BASE_URL}/Logo.png`;

/**
 * Updates document title + meta/OG tags for a given page.
 * @param {{ title: string, description?: string, image?: string, url?: string, type?: string }} opts
 */
const useSEO = ({ title, description, image, url, type = 'website' }) => {
  useEffect(() => {
    if (!title) return;

    const fullTitle = title.endsWith('RedAutos') ? title : `${title} | RedAutos`;
    const desc = description || 'RedAutos — comprá y vendé autos en Uruguay.';
    const img = image || DEFAULT_IMAGE;
    const canonical = url ? `${BASE_URL}${url}` : window.location.href;

    // Title
    document.title = fullTitle;

    const setMeta = (selector, content) => {
      let el = document.querySelector(selector);
      if (el) el.setAttribute('content', content);
    };

    const setLink = (rel, href) => {
      let el = document.querySelector(`link[rel="${rel}"]`);
      if (!el) { el = document.createElement('link'); el.rel = rel; document.head.appendChild(el); }
      el.href = href;
    };

    // Standard
    setMeta('meta[name="description"]', desc);

    // Canonical
    setLink('canonical', canonical);

    // Open Graph
    setMeta('meta[property="og:title"]', fullTitle);
    setMeta('meta[property="og:description"]', desc);
    setMeta('meta[property="og:image"]', img);
    setMeta('meta[property="og:url"]', canonical);
    setMeta('meta[property="og:type"]', type);

    // Twitter
    setMeta('meta[name="twitter:title"]', fullTitle);
    setMeta('meta[name="twitter:description"]', desc);
    setMeta('meta[name="twitter:image"]', img);
  }, [title, description, image, url, type]);
};

export default useSEO;
