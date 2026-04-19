// draft.js
// Point d'entrée CLI : node draft.js <url>
import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import slugify from 'slugify';

import { ingestUrl } from './src/ingest.js';
import { scriptArticle } from './src/script.js';
import { findImageForSlide } from './src/images.js';
import { renderSlides } from './src/render.js';

async function main() {
  const url = process.argv[2];
  if (!url) {
    console.error('Usage : node draft.js <url>');
    process.exit(1);
  }
  if (!process.env.GROQ_API_KEY) {
    console.error('Erreur : GROQ_API_KEY manquante dans .env');
    process.exit(1);
  }

  // 1. Ingestion
  const article = await ingestUrl(url);
  console.log(`[main] Article : "${article.title}"`);

  // 2. Scénarisation via Claude
  const script = await scriptArticle(article);
  console.log(`[main] ${script.slides.length} slides, template "${script.template}"`);

  // Créer le dossier de sortie
  const date = new Date().toISOString().slice(0, 10);
  const slug = slugify(article.title || 'draft', { lower: true, strict: true }).slice(0, 50);
  const draftDir = path.join(process.cwd(), 'drafts', `${date}-${slug}`);
  const imagesDir = path.join(draftDir, 'images');
  await fs.mkdir(imagesDir, { recursive: true });

  // 3. Recherche d'images pour chaque slide
  console.log(`[main] Recherche d'images...`);
  const missingImages = [];
  for (const slide of script.slides) {
    if (!slide.image_strategy || slide.image_strategy === 'none') continue;
    const result = await findImageForSlide(slide.image_strategy, imagesDir);
    if (result) {
      slide.imageFile = result.path;
      slide.imageAttribution = result.attribution;
      console.log(`[main] ✓ slide ${slide.index} : ${result.fileName}`);
    } else {
      slide.missingImageNote = `Cherche une image pour : ${slide.image_strategy}`;
      missingImages.push({ index: slide.index, strategy: slide.image_strategy });
      console.log(`[main] ✗ slide ${slide.index} : pas d'image libre de droits trouvée (${slide.image_strategy})`);
    }
  }

  // 4. Rendu des slides en PNG
  const slideFiles = await renderSlides(script, script.slides, draftDir);

  // 5. Export des artefacts : JSON, caption, notes
  await fs.writeFile(
    path.join(draftDir, 'script.json'),
    JSON.stringify(script, null, 2),
    'utf-8'
  );

  const captionContent = `# Caption Instagram

## Source
${article.title}
${article.url}

## Caption
${script.caption}

## Hashtags
${(script.hashtags || []).join(' ')}
`;
  await fs.writeFile(path.join(draftDir, 'caption.md'), captionContent, 'utf-8');

  if (missingImages.length > 0) {
    const notesContent = `# Images manquantes

Les slides suivantes n'ont pas trouvé d'image libre de droits. À toi de chercher manuellement :

${missingImages.map((m) => `- **Slide ${m.index}** : ${m.strategy}`).join('\n')}
`;
    await fs.writeFile(path.join(draftDir, 'notes.md'), notesContent, 'utf-8');
  }

  console.log(`\n✅ Draft généré : ${draftDir}`);
  console.log(`   ${slideFiles.length} slides PNG`);
  console.log(`   Caption + hashtags : caption.md`);
  if (missingImages.length > 0) {
    console.log(`   ⚠  ${missingImages.length} image(s) à chercher manuellement : notes.md`);
  }
  console.log(`\n👉 Pour éditer ce draft : node edit.js "${path.basename(draftDir)}"`);
}

main().catch((err) => {
  console.error('Erreur :', err);
  process.exit(1);
});
