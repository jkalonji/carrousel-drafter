// draft.js
// Point d'entrée CLI : node draft.js <url>
import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import slugify from 'slugify';

import { ingestUrl } from './src/ingest.js';
import { scriptArticle } from './src/script.js';
import { renderSlides } from './src/render.js';

async function main() {
  const urls = process.argv.slice(2);
  if (!urls.length) {
    console.error('Usage : node draft.js <url> [url2] [url3...]');
    process.exit(1);
  }
  if (!process.env.GROQ_API_KEY) {
    console.error('Erreur : GROQ_API_KEY manquante dans .env');
    process.exit(1);
  }

  // 1. Ingestion (en parallèle)
  const articles = await Promise.all(urls.map(url => ingestUrl(url)));
  articles.forEach(a => console.log(`[main] Article : "${a.title}"`));

  // 2. Scénarisation via Groq
  const script = await scriptArticle(articles);
  console.log(`[main] ${script.slides.length} slides, template "${script.template}"`);

  // Créer le dossier de sortie (basé sur le premier article)
  const date = new Date().toISOString().slice(0, 10);
  const slug = slugify(articles[0].title || 'draft', { lower: true, strict: true }).slice(0, 50);
  const draftDir = path.join(process.cwd(), 'drafts', `${date}-${slug}`);
  await fs.mkdir(draftDir, { recursive: true });

  // 3. Rendu des slides en PNG
  const slideFiles = await renderSlides(script, script.slides, draftDir);

  // 4. Export des artefacts : JSON, caption
  await fs.writeFile(
    path.join(draftDir, 'script.json'),
    JSON.stringify(script, null, 2),
    'utf-8'
  );

  const sourcesBlock = articles
    .map(a => `${a.title}\n${a.url}`)
    .join('\n\n');

  const captionContent = `# Caption Instagram

## Sources
${sourcesBlock}

## Caption
${script.caption}

## Hashtags
${(script.hashtags || []).join(' ')}
`;
  await fs.writeFile(path.join(draftDir, 'caption.md'), captionContent, 'utf-8');

  console.log(`\n✅ Draft généré : ${draftDir}`);
  console.log(`   ${slideFiles.length} slides PNG`);
  console.log(`   Caption + hashtags : caption.md`);
  console.log(`\n👉 Pour éditer ce draft : node edit.js "${path.basename(draftDir)}"`);
}

main().catch((err) => {
  console.error('Erreur :', err);
  process.exit(1);
});
