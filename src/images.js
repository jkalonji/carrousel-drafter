// src/images.js
// Recherche d'images libres de droits sur Wikimedia Commons uniquement (itération 1)
import fs from 'node:fs/promises';
import path from 'node:path';

const WIKI_API = 'https://commons.wikimedia.org/w/api.php';
const WIKIPEDIA_API = 'https://en.wikipedia.org/w/api.php';

// Cherche une image via l'API Wikipedia (donne souvent le meilleur portrait officiel)
async function searchWikipediaPageImage(query) {
  const url = `${WIKIPEDIA_API}?action=query&format=json&prop=pageimages&piprop=original&titles=${encodeURIComponent(query)}&redirects=1&origin=*`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'CarouselDrafter/0.1 (personal project)' },
  });
  const data = await res.json();
  const pages = data?.query?.pages || {};
  for (const p of Object.values(pages)) {
    if (p.original?.source) return p.original.source;
  }
  return null;
}

// Fallback : recherche plein texte sur Wikimedia Commons
async function searchCommons(query) {
  const url = `${WIKI_API}?action=query&format=json&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrnamespace=6&gsrlimit=5&prop=imageinfo&iiprop=url|size|mime&origin=*`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'CarouselDrafter/0.1 (personal project)' },
  });
  const data = await res.json();
  const pages = data?.query?.pages || {};
  const candidates = Object.values(pages)
    .map((p) => p.imageinfo?.[0])
    .filter((i) => i && /image\/(jpeg|png|webp)/i.test(i.mime))
    .filter((i) => i.width >= 600); // éviter les miniatures
  return candidates[0]?.url || null;
}

async function downloadImage(imageUrl, dest) {
  const res = await fetch(imageUrl, {
    headers: { 'User-Agent': 'CarouselDrafter/0.1 (personal project)' },
  });
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await fs.writeFile(dest, buf);
  return dest;
}

export async function findImageForSlide(strategy, imagesDir) {
  if (!strategy || strategy === 'none') return null;

  const [kind, ...rest] = strategy.split(':');
  const query = rest.join(':').trim();
  if (!query) return null;

  let imageUrl = null;
  let attribution = null;

  try {
    if (kind === 'portrait' || kind === 'logo') {
      // Wikipedia page image est souvent la meilleure source pour portraits/logos
      imageUrl = await searchWikipediaPageImage(query);
      if (!imageUrl) imageUrl = await searchCommons(query);
      attribution = `Wikimedia / Wikipedia – ${query}`;
    } else if (kind === 'map') {
      imageUrl = await searchCommons(`${query} map`);
      attribution = `Wikimedia Commons – ${query} map`;
    } else if (kind === 'concept') {
      imageUrl = await searchCommons(query);
      attribution = `Wikimedia Commons – ${query}`;
    }

    if (!imageUrl) return null;

    const ext = path.extname(new URL(imageUrl).pathname) || '.jpg';
    const fileName = `${kind}-${query.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}${ext}`;
    const dest = path.join(imagesDir, fileName);
    await downloadImage(imageUrl, dest);

    return { path: dest, fileName, sourceUrl: imageUrl, attribution };
  } catch (e) {
    console.warn(`[images] Échec pour "${strategy}":`, e.message);
    return null;
  }
}
