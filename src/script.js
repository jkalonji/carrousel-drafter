// src/script.js
// Appelle Groq (API compatible OpenAI) pour transformer l'article en script de carrousel
import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: 'https://api.groq.com/openai/v1',
});

// Modèle par défaut : DeepSeek R1 Distill Llama 70B - raisonnement poussé
const MODEL = process.env.GROQ_MODEL || 'deepseek-r1-distill-llama-70b';

const SYSTEM_PROMPT = `Tu es un expert en création de carrousels Instagram viraux dans le domaine tech/IA/business/géopolitique.

Ton style de référence :
- Titres serif élégants, impactants, avec un mot-clé souligné en bleu
- Hook ultra-accrocheur en slide 1 (ex: "Anthropic's Oops Moment. Code leaked.")
- Data/stats en monospace pour crédibilité (ex: "57MB file. 512,000 lines.")
- Ton direct, punchy, zéro bullshit
- 6 à 8 slides max
- Dernière slide : CTA de partage/suivi

Pour chaque slide, tu dois produire une "image_strategy" qui dira quelle image chercher :
- "portrait:<Nom Prénom>" pour une personne publique (ex: "portrait:Sam Altman")
- "logo:<Entreprise>" pour un logo (ex: "logo:OpenAI")
- "map:<zone>" pour une carte géographique (ex: "map:Taiwan")
- "concept:<description>" pour une image d'illustration (on cherchera sur Wikimedia)
- "none" si pas d'image pertinente, juste de la typo

Tu réponds UNIQUEMENT avec un JSON valide, sans markdown, sans préambule, sans commentaire.`;

const userPrompt = (article) => `Voici l'article à transformer en carrousel Instagram :

TITRE : ${article.title}
SOURCE : ${article.source}
AUTEUR : ${article.author}
DESCRIPTION : ${article.description}

CONTENU :
${article.content.slice(0, 8000)}

Produis un JSON strictement au format suivant :

{
  "topic": "sujet principal en une phrase",
  "tone": "analytical|storytelling|breaking-news|educational",
  "template": "oops-moment",
  "slides": [
    {
      "index": 1,
      "role": "hook",
      "title": "Le titre principal de la slide",
      "highlight": "Le mot-clé souligné en bleu (doit être présent dans le title)",
      "stat": "Stat en monospace (ex: '57MB file. 512,000 lines.') ou null",
      "body": "Texte secondaire court ou null",
      "image_strategy": "portrait:Sam Altman OU logo:OpenAI OU map:Taiwan OU concept:description OU none"
    }
  ],
  "caption": "Caption Instagram complète (200-400 mots, émojis OK, ton engageant)",
  "hashtags": ["#tag1", "#tag2"]
}

RÈGLES STRICTES :
- 6 à 8 slides
- La slide 1 doit être un HOOK percutant avec un "highlight" souligné (et ce highlight doit être un sous-ensemble exact du title)
- La dernière slide est un CTA (follow, save, share)
- "stat" est utilisé quand il y a un chiffre marquant à afficher en monospace
- Pour l'image_strategy, sois PRÉCIS (ex: "portrait:Dario Amodei" plutôt que "portrait:CEO")
- 15-25 hashtags pertinents, mix de gros volumes et de niche
- Retourne UNIQUEMENT le JSON, rien d'autre`;

export async function scriptArticle(article) {
  console.log(`[script] Scénarisation via Groq (${MODEL})...`);

  const completion = await client.chat.completions.create({
    model: MODEL,
    max_tokens: 8192, // DeepSeek R1 a besoin de tokens pour son bloc <think>
    temperature: 0.6, // recommandé par DeepSeek pour R1
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt(article) },
    ],
  });

  const raw = completion.choices[0]?.message?.content?.trim() || '';

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
    if (!parsed.template) parsed.template = 'oops-moment';

    // Nettoyer toute balise ou artefact résiduel dans les champs texte
    for (const slide of parsed.slides) {
      slide.title = stripTags(slide.title);
      slide.highlight = stripTags(slide.highlight);
      slide.stat = stripTags(slide.stat);
      slide.body = stripTags(slide.body);
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
