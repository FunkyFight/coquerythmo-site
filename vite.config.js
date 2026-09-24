import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const INCLUDE = /<!--\s*@include\s+([\w./-]+)\s*-->/g;

// Static HTML partials: each section lives in its own file and is inlined at
// build time, so the shipped page is plain HTML (readable without JS, indexable).
function htmlIncludes() {
  const expand = (html, depth = 0) =>
    depth > 4
      ? html
      : html.replace(INCLUDE, (_, file) =>
          expand(readFileSync(resolve(root, 'src', file), 'utf8'), depth + 1),
        );
  return {
    name: 'coquerythmo-html-includes',
    transformIndexHtml: { order: 'pre', handler: (html) => expand(html) },
    handleHotUpdate({ file, server }) {
      if (file.endsWith('.html')) server.ws.send({ type: 'full-reload' });
    },
  };
}

// Search engines and link previews need the site's absolute address: the
// %SITE_URL% placeholders in index.html (canonical, Open Graph, JSON-LD) are
// filled with it, and robots.txt and sitemap.xml are written next to the page.
// SITE_URL overrides it for another host; an empty SITE_URL leaves canonical
// and og:url out, og:image relative, and writes no sitemap.
const SITE = 'https://coquelicot.world';

function seo() {
  const site = (process.env.SITE_URL ?? SITE).trim().replace(/\/+$/, '');
  return [
    {
      name: 'coquerythmo-seo',
      configResolved(config) {
        if (config.command === 'build' && !site) config.logger.warn('SITE_URL non défini : ni lien canonique ni sitemap.xml, et les aperçus de liens resteront incomplets.');
      },
      transformIndexHtml: {
        order: 'pre',
        handler: (html) =>
          (site
            ? html
            : // a canonical or og:url without the address would point nowhere
              html.replace(/\n\s*<link rel="canonical"[^>]*>/, '').replace(/\n\s*<meta property="og:url"[^>]*>/, '')
          ).replaceAll('%SITE_URL%', site),
      },
      generateBundle() {
        // /icons/ holds the app's UI icons and mouth drawings: kept out of the
        // image index so Google can't pick a mouth as the result thumbnail
        // (the favicon files sit at the root and stay crawlable)
        const robots = [
          'User-agent: *',
          'Allow: /',
          '',
          'User-agent: Googlebot-Image',
          'Disallow: /icons/',
          ...(site ? ['', `Sitemap: ${site}/sitemap.xml`] : []),
          '',
        ].join('\n');
        this.emitFile({ type: 'asset', fileName: 'robots.txt', source: robots });
        if (!site) return;
        const today = new Date().toISOString().slice(0, 10);
        this.emitFile({
          type: 'asset',
          fileName: 'sitemap.xml',
          source: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url>\n    <loc>${site}/</loc>\n    <lastmod>${today}</lastmod>\n  </url>\n</urlset>\n`,
        });
      },
    },
    {
      // the headline font is needed first: preload its latin upright file
      name: 'coquerythmo-font-preload',
      apply: 'build',
      transformIndexHtml: {
        order: 'post',
        handler(_, ctx) {
          const font = Object.keys(ctx.bundle || {}).find((name) => /archivo-latin-wdth-normal-[\w-]+\.woff2$/.test(name));
          if (!font) return;
          return [{ tag: 'link', attrs: { rel: 'preload', href: `/${font}`, as: 'font', type: 'font/woff2', crossorigin: '' }, injectTo: 'head-prepend' }];
        },
      },
    },
  ];
}

export default defineConfig({
  plugins: [htmlIncludes(), seo()],
  build: { target: 'es2020', assetsInlineLimit: 0 },
});
