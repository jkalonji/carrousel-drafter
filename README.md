# Carousel Drafter

Génère des drafts de carrousels Instagram à partir d'URLs d'articles, avec un éditeur web local intégré.

## Installation

```bash
npm install
copy .env.example .env   # Windows
# cp .env.example .env   # Mac/Linux
# Édite .env et ajoute ta clé Groq (https://console.groq.com/keys)
```

**Prérequis :** Node.js 20+ (Puppeteer télécharge Chromium au premier `npm install`).

## Usage

### 1. Générer un draft

```bash
node draft.js https://example.com/article-a-transformer
```

Sortie dans `drafts/YYYY-MM-DD-<slug>/` : slides PNG + script.json + caption.md.

### 2. Éditer un draft

```bash
node edit.js 2026-04-19-anthropics-nuclear-bomb
```

Ouvre un éditeur web sur `http://localhost:3000` :
- Preview live des slides (gauche), champs éditables (droite)
- Auto-save + re-render automatique après chaque modification
- Relancer la recherche Wikimedia ou uploader ta propre image
- Édition caption + hashtags directement dans l'interface

## Configuration (.env)

```
GROQ_API_KEY=gsk_xxxxx
# Optionnel :
# GROQ_MODEL=deepseek-r1-distill-llama-70b
```

## Modèles Groq disponibles

- `deepseek-r1-distill-llama-70b` (défaut) : raisonnement poussé, meilleure qualité éditoriale
- `llama-3.3-70b-versatile` : plus rapide, bon compromis
- `llama-3.1-8b-instant` : très rapide, qualité moindre

## Structure

```
src/
├── ingest.js       URL → texte propre
├── script.js       Groq → JSON scénario (+ nettoyage balises <think>)
├── images.js       Wikimedia Commons → images
└── render.js       HTML + Puppeteer → PNG 1080×1350
editor-ui/
└── index.html      Interface éditeur web
templates/
└── oops-moment.html
draft.js            CLI : génère un draft depuis une URL
edit.js             Serveur Express de l'éditeur web
```
