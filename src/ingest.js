// src/ingest.js
// Extrait le contenu propre d'une URL d'article
import { extract } from '@extractus/article-extractor';

export async function ingestUrl(url) {
  console.log(`[ingest] Extraction de ${url}...`);
  const article = await extract(url);
  if (!article || !article.content) {
    throw new Error(`Impossible d'extraire le contenu de ${url}`);
  }

  // article.content contient du HTML, on le nettoie en texte brut
  const plainText = article.content
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return {
    url,
    title: article.title || '',
    author: article.author || '',
    publishedAt: article.published || '',
    description: article.description || '',
    content: plainText,
    source: article.source || new URL(url).hostname,
  };
}
