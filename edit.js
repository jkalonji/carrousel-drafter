// edit.js
// Serveur Express qui sert l'éditeur web local pour modifier un draft
// Usage : node edit.js <nom-du-dossier-draft>
import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import open from 'open';

import { renderSingleSlide } from './src/render.js';
import { findImageForSlide } from './src/images.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

async function main() {
  const draftName = process.argv[2];
  if (!draftName) {
    console.error('Usage : node edit.js <nom-du-dossier-draft>');
    console.error('Ex    : node edit.js 2026-04-19-anthropics-nuclear-bomb');
    process.exit(1);
  }

  const draftDir = path.resolve(process.cwd(), 'drafts', draftName);
  const scriptPath = path.join(draftDir, 'script.json');
  const imagesDir = path.join(draftDir, 'images');
  const uploadsDir = path.join(imagesDir, 'uploaded');

  try {
    await fs.access(scriptPath);
  } catch {
    console.error(`Dossier introuvable : ${draftDir}`);
    process.exit(1);
  }
  await fs.mkdir(uploadsDir, { recursive: true });

  // Convertit un chemin absolu d'image en URL relative servie par Express
  const toImageUrl = (imageFile) => {
    if (!imageFile) return null;
    const rel = path.relative(draftDir, imageFile).replace(/\\/g, '/');
    return `/draft/${rel}`;
  };

  const app = express();
  app.use(express.json({ limit: '20mb' }));

  // Servir les fichiers statiques du draft (slides PNG + images)
  app.use('/draft', express.static(draftDir));
  // Servir l'UI HTML
  app.use('/ui', express.static(path.join(__dirname, 'editor-ui')));

  // ----- API -----

  // GET /api/script : retourne le JSON du draft
  app.get('/api/script', async (_req, res) => {
    const json = JSON.parse(await fs.readFile(scriptPath, 'utf-8'));
    for (const slide of json.slides) {
      if (slide.imageFile) slide.imageUrl = toImageUrl(slide.imageFile);
    }
    res.json(json);
  });

  // POST /api/script : sauvegarde le JSON du draft
  app.post('/api/script', async (req, res) => {
    await fs.writeFile(scriptPath, JSON.stringify(req.body, null, 2), 'utf-8');
    res.json({ ok: true });
  });

  // POST /api/render/:index : re-rend UNE slide et renvoie l'URL du PNG
  app.post('/api/render/:index', async (req, res) => {
    try {
      const idx = parseInt(req.params.index, 10);
      const script = JSON.parse(await fs.readFile(scriptPath, 'utf-8'));
      const slide = script.slides[idx];
      if (!slide) return res.status(404).json({ error: 'slide introuvable' });

      const outPath = path.join(draftDir, `slide-${String(idx + 1).padStart(2, '0')}.png`);
      await renderSingleSlide(script, slide, idx, script.slides.length, outPath);

      res.json({
        ok: true,
        url: `/draft/slide-${String(idx + 1).padStart(2, '0')}.png?t=${Date.now()}`,
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/render-all : re-rend toutes les slides
  app.post('/api/render-all', async (_req, res) => {
    try {
      const script = JSON.parse(await fs.readFile(scriptPath, 'utf-8'));
      const total = script.slides.length;
      for (let i = 0; i < total; i++) {
        const outPath = path.join(draftDir, `slide-${String(i + 1).padStart(2, '0')}.png`);
        await renderSingleSlide(script, script.slides[i], i, total, outPath);
      }
      res.json({ ok: true, count: total });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/refetch-image/:index : relance la recherche d'image pour une slide
  app.post('/api/refetch-image/:index', async (req, res) => {
    try {
      const idx = parseInt(req.params.index, 10);
      const strategy = req.body?.strategy;
      const script = JSON.parse(await fs.readFile(scriptPath, 'utf-8'));
      const slide = script.slides[idx];
      if (!slide) return res.status(404).json({ error: 'slide introuvable' });

      if (strategy) slide.image_strategy = strategy;
      const result = await findImageForSlide(slide.image_strategy, imagesDir);

      if (result) {
        slide.imageFile = result.path;
        slide.imageAttribution = result.attribution;
        slide.missingImageNote = '';
      } else {
        slide.imageFile = null;
        slide.missingImageNote = `Cherche une image pour : ${slide.image_strategy}`;
      }

      await fs.writeFile(scriptPath, JSON.stringify(script, null, 2), 'utf-8');

      const outPath = path.join(draftDir, `slide-${String(idx + 1).padStart(2, '0')}.png`);
      await renderSingleSlide(script, slide, idx, script.slides.length, outPath);

      res.json({
        ok: true,
        found: !!result,
        slide: { ...slide, imageUrl: toImageUrl(slide.imageFile) },
        url: `/draft/slide-${String(idx + 1).padStart(2, '0')}.png?t=${Date.now()}`,
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/upload-image/:index : upload d'une image perso pour une slide
  const upload = multer({ dest: uploadsDir });
  app.post('/api/upload-image/:index', upload.single('image'), async (req, res) => {
    try {
      const idx = parseInt(req.params.index, 10);
      const script = JSON.parse(await fs.readFile(scriptPath, 'utf-8'));
      const slide = script.slides[idx];
      if (!slide) return res.status(404).json({ error: 'slide introuvable' });
      if (!req.file) return res.status(400).json({ error: 'fichier manquant' });

      // Renommer le fichier uploadé avec son extension
      const ext = path.extname(req.file.originalname) || '.jpg';
      const finalName = `upload-slide-${idx + 1}-${Date.now()}${ext}`;
      const finalPath = path.join(uploadsDir, finalName);
      await fs.rename(req.file.path, finalPath);

      slide.imageFile = finalPath;
      slide.imageAttribution = 'Image uploadée par l\'utilisateur';
      slide.missingImageNote = '';

      await fs.writeFile(scriptPath, JSON.stringify(script, null, 2), 'utf-8');

      const outPath = path.join(draftDir, `slide-${String(idx + 1).padStart(2, '0')}.png`);
      await renderSingleSlide(script, slide, idx, script.slides.length, outPath);

      res.json({
        ok: true,
        slide: { ...slide, imageUrl: toImageUrl(slide.imageFile) },
        url: `/draft/slide-${String(idx + 1).padStart(2, '0')}.png?t=${Date.now()}`,
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: e.message });
    }
  });

  // GET / : redirige vers l'UI
  app.get('/', (_req, res) => res.redirect('/ui/index.html'));

  app.listen(PORT, () => {
    const url = `http://localhost:${PORT}`;
    console.log(`\n🎨 Éditeur ouvert sur ${url}`);
    console.log(`   Draft : ${draftDir}`);
    console.log(`   Ctrl+C pour arrêter\n`);
    open(url).catch(() => {});
  });
}

main().catch((err) => {
  console.error('Erreur :', err);
  process.exit(1);
});
