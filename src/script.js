// src/script.js
// Appelle Groq (API compatible OpenAI) pour transformer l'article en script de carrousel
import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: 'https://api.groq.com/openai/v1',
});

// Modèle par défaut : DeepSeek R1 Distill Llama 70B - raisonnement poussé
const MODEL         = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
const FALLBACK_MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct';

const SYSTEM_PROMPT = `You are an expert at creating viral Instagram carousels in the tech/AI/business/geopolitics space.

Your reference style:
- Elegant serif titles, impactful, with one keyword underlined in blue
- Ultra-catchy hook in slide 1 (e.g. "Anthropic's Oops Moment. Code leaked.")
- Data/stats in monospace for credibility (e.g. "57MB file. 512,000 lines.")
- Direct, punchy tone, zero bullshit
- 6 to 8 slides max
- Last slide: share/follow CTA

You respond ONLY with valid JSON, no markdown, no preamble, no comments.`;

function charsPerArticle(n) {
  if (n <= 1) return 8000;
  if (n === 2) return 4000;
  if (n === 3) return 2500;
  return 2000;
}

function formatArticles(articles) {
  const limit = charsPerArticle(articles.length);
  if (articles.length === 1) {
    const a = articles[0];
    return `Here is the article to turn into an Instagram carousel:

TITLE: ${a.title}
SOURCE: ${a.source}
AUTHOR: ${a.author}
DESCRIPTION: ${a.description}

CONTENT:
${a.content.slice(0, limit)}`;
  }

  const blocks = articles.map((a, i) => `--- SOURCE ${i + 1}: ${a.source} ---
TITLE: ${a.title}
AUTHOR: ${a.author}
DESCRIPTION: ${a.description}

CONTENT:
${a.content.slice(0, limit)}`).join('\n\n');

  return `Here are ${articles.length} articles to cross-reference and synthesize into a single Instagram carousel.
Draw insights from ALL sources. Highlight convergences and contrasts between them.

${blocks}`;
}

const userPrompt = (articles) => `${formatArticles(articles)}

Produce a JSON strictly in the following format:

{
  "topic": "main subject in one sentence",
  "tone": "analytical|storytelling|breaking-news|educational",
  "template": "oops-moment",
  "slides": [
    {
      "index": 1,
      "role": "hook",
      "title": "The main title of the slide",
      "highlight": "The keyword underlined in blue (must be present in the title)",
      "stat": "Stat in monospace (e.g. '57MB file. 512,000 lines.') or null",
      "body": "Short secondary text or null"
    }
  ],
  "caption": "Full Instagram caption (200-400 words, emojis OK, engaging tone)",
  "hashtags": ["#tag1", "#tag2"]
}

STRICT RULES:
- 6 to 8 slides
- Slide 1 must be a punchy HOOK with a highlighted keyword (the highlight must be an exact substring of the title)
- Last slide is a CTA (follow, save, share)
- "stat" is used when there is a striking number to display in monospace
- 15-25 relevant hashtags, mix of high-volume and niche
- CAPITALIZATION: use sentence case only — capitalize the first word and proper nouns, never every word. Wrong: "The New AI Model Changes Everything". Correct: "The new AI model changes everything".
- Return ONLY the JSON, nothing else`;

async function callGroq(model, articles) {
  const completion = await client.chat.completions.create({
    model,
    max_tokens: 4096,
    temperature: 0.6,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt(articles) },
    ],
  });
  return completion.choices[0]?.message?.content?.trim() || '';
}

export async function scriptArticle(articleOrArticles) {
  const articles = Array.isArray(articleOrArticles) ? articleOrArticles : [articleOrArticles];
  let model = MODEL;
  console.log(`[script] Scénarisation via Groq (${model}), ${articles.length} source(s)...`);

  let raw;
  try {
    raw = await callGroq(model, articles);
  } catch (err) {
    if (err.status === 429 && model !== FALLBACK_MODEL) {
      console.warn(`[script] Rate limit atteint sur ${model}, bascule sur ${FALLBACK_MODEL}...`);
      model = FALLBACK_MODEL;
      raw = await callGroq(model, articles);
    } else {
      throw err;
    }
  }

  // 1. Retirer le bloc de raisonnement <think>...</think> de DeepSeek R1
  let clean = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  // Au cas où la balise fermante manque (tronquée)
  clean = clean.replace(/^<think>[\s\S]*?(?=\{)/i, '').trim();

  // 2. Retirer les fences markdown éventuels
  clean = clean.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();

  // 3. Extraire le premier objet JSON si du texte traîne autour
  const firstBrace = clean.indexOf('{');
  const lastBrace = clean.lastIndexOf('}');
  if (firstBrace > 0 || lastBrace < clean.length - 1) {
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      clean = clean.slice(firstBrace, lastBrace + 1);
    }
  }

  try {
    const parsed = JSON.parse(clean);
    if (!parsed.slides || !Array.isArray(parsed.slides)) {
      throw new Error('Le JSON ne contient pas de tableau "slides"');
    }
    const KNOWN_TEMPLATES = ['oops-moment', 'achievement'];
    if (!parsed.template || !KNOWN_TEMPLATES.includes(parsed.template)) {
      parsed.template = 'oops-moment';
    }

    // Nettoyer toute balise ou artefact résiduel dans les champs texte
    for (const slide of parsed.slides) {
      slide.title     = stripTags(slide.title);
      slide.highlight = stripTags(slide.highlight);
      slide.stat      = stripTags(slide.stat);
      slide.body      = stripTags(slide.body);
      delete slide.image_strategy;
    }
    parsed.caption = stripTags(parsed.caption);

    return parsed;
  } catch (e) {
    console.error('[script] Réponse Groq non-parseable :\n', raw.slice(0, 2000));
    throw new Error(`Groq n'a pas renvoyé un JSON valide : ${e.message}`);
  }
}

// Retire toutes les balises HTML/XML d'une chaîne (sécurité pour DeepSeek R1)
function stripTags(value) {
  if (!value || typeof value !== 'string') return value;
  return value
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<\/?[a-z][^>]*>/gi, '')
    .trim();
}
