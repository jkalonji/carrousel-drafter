// src/research.js
// Enrichit le contexte avant la génération :
//   Levier 1 — extraction de faits/stats depuis le contenu des articles (LLM rapide)
//   Levier 2 — recherche web (Bing + Google) pour compléter avec des données chiffrées

import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: 'https://api.groq.com/openai/v1',
});

const FAST_MODEL = 'llama-3.1-8b-instant';

// ── Levier 1 : extraire faits concrets + générer des requêtes de recherche ─────

async function extractFactsAndQueries(articles) {
  const blocks = articles.map((a, i) =>
    `[Source ${i + 1}] ${a.title}\n${a.content.slice(0, 4000)}`
  ).join('\n\n');

  const prompt = `You are a fact extractor. From the articles below, extract every specific, concrete fact and generate web search queries to find more statistics.

${blocks}

Return ONLY this JSON (no markdown, no preamble):
{
  "topic": "main subject in one sentence",
  "facts": [
    "OpenAI laid off 25% of its safety research team in May 2025",
    "DeepSeek V4 supports a 1,000,000 token context window",
    "Pricing set at $0.14 per million input tokens"
  ],
  "queries": [
    "DeepSeek V4 benchmark performance statistics 2025",
    "DeepSeek vs GPT-4o cost comparison data"
  ]
}

STRICT RULES:
- facts: ONLY concrete data (numbers, percentages, dollar amounts, named people/orgs, dates). Zero vague claims.
- facts: 10 to 20 items. If numbers exist in the text, they MUST appear here.
- queries: 3 to 4 queries specifically targeting statistics, benchmarks, or market data
- Return ONLY the JSON`;

  try {
    const completion = await client.chat.completions.create({
      model: FAST_MODEL,
      max_tokens: 1024,
      temperature: 0.1,
      messages: [{ role: 'user', content: prompt }],
    });
    let raw = completion.choices[0]?.message?.content?.trim() || '';
    raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
    const first = raw.indexOf('{');
    const last  = raw.lastIndexOf('}');
    if (first >= 0 && last > first) raw = raw.slice(first, last + 1);
    const parsed = JSON.parse(raw);
    return {
      topic:   parsed.topic   || '',
      facts:   Array.isArray(parsed.facts)   ? parsed.facts   : [],
      queries: Array.isArray(parsed.queries) ? parsed.queries : [],
    };
  } catch (e) {
    console.warn(`[research] Extraction échouée : ${e.message}`);
    return { topic: articles[0]?.title || '', facts: [], queries: [] };
  }
}

// ── Levier 2 : recherche web — snippets texte (pas images) ────────────────────

async function searchBingWeb(query) {
  const key = process.env.BING_SEARCH_KEY;
  if (!key) return [];
  try {
    const res = await fetch(
      `https://api.bing.microsoft.com/v7.0/search?q=${encodeURIComponent(query)}&count=3&mkt=en-US`,
      { headers: { 'Ocp-Apim-Subscription-Key': key } }
    );
    if (!res.ok) { console.warn(`[research] Bing web ${res.status}`); return []; }
    const data = await res.json();
    return (data.webPages?.value || []).map(p => `${p.name} (${p.displayUrl}): ${p.snippet}`);
  } catch (e) {
    console.warn(`[research] Bing web error: ${e.message}`);
    return [];
  }
}

async function searchGoogleWeb(query) {
  const key = process.env.GOOGLE_SEARCH_KEY;
  const cx  = process.env.GOOGLE_SEARCH_CX;
  if (!key || !cx) return [];
  try {
    const res = await fetch(
      `https://www.googleapis.com/customsearch/v1?key=${key}&cx=${cx}&q=${encodeURIComponent(query)}&num=3`
    );
    if (!res.ok) { console.warn(`[research] Google web ${res.status}`); return []; }
    const data = await res.json();
    return (data.items || []).map(p => `${p.title} (${p.displayLink}): ${p.snippet}`);
  } catch (e) {
    console.warn(`[research] Google web error: ${e.message}`);
    return [];
  }
}

// ── Export principal ───────────────────────────────────────────────────────────

export async function enrichContext(articles) {
  console.log('[research] Extraction de faits depuis le contenu...');
  const extracted = await extractFactsAndQueries(articles);
  console.log(`[research] ${extracted.facts.length} faits extraits, ${extracted.queries.length} requêtes générées`);

  let webSnippets = [];
  const hasSearchKeys = process.env.BING_SEARCH_KEY || process.env.GOOGLE_SEARCH_KEY;

  if (hasSearchKeys && extracted.queries.length) {
    console.log('[research] Recherches web en cours...');
    const results = await Promise.all(
      extracted.queries.map(q =>
        Promise.all([searchBingWeb(q), searchGoogleWeb(q)])
      )
    );
    const seen = new Set();
    for (const [bing, google] of results) {
      for (const snippet of [...bing, ...google]) {
        if (!seen.has(snippet)) { seen.add(snippet); webSnippets.push(snippet); }
      }
    }
    console.log(`[research] ${webSnippets.length} snippets web collectés`);
  }

  return {
    topic:       extracted.topic,
    facts:       extracted.facts.slice(0, 20),
    webSnippets: webSnippets.slice(0, 15),
  };
}
