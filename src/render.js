// src/render.js
// Convertit chaque slide en PNG 1080x1350 via Puppeteer
import fs from 'node:fs/promises';
import path from 'node:path';
import puppeteer from 'puppeteer';

// Mini moteur de template "à la Mustache" pour nos besoins simples
function renderTemplate(tpl, data) {
  // Sections conditionnelles : {{#key}}...{{/key}}
  let out = tpl.replace(/\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_, key, inner) => {
    const val = data[key];
    if (!val) return '';
    if (Array.isArray(val)) {
      return val.map((item) => renderTemplate(inner, { ...data, ...item })).join('');
    }
    return renderTemplate(inner, { ...data, [key]: val });
  });
  // Variables non-échappées : {{{key}}}
  out = out.replace(/\{\{\{(\w+)\}\}\}/g, (_, key) => data[key] ?? '');
  // Variables échappées : {{key}}
  out = out.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const v = data[key] ?? '';
    return String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  });
  return out;
}

// Construit le titre en HTML avec le mot-clé "highlight" souligné en bleu
function buildTitleHtml(title, highlight, style = '') {
  if (!highlight || !title.includes(highlight)) {
    return [{ title_html: escapeHtml(title), title_size: title.length > 40 ? 'small' : '', title_style: style }];
  }
  const before = title.split(highlight)[0];
  const after = title.split(highlight).slice(1).join(highlight);
  const html = `${escapeHtml(before)}<span class="highlight">${escapeHtml(highlight)}</span>${escapeHtml(after)}`;
  const size = title.length > 60 ? 'xsmall' : title.length > 35 ? 'small' : '';
  return [{ title_html: html, title_size: size, title_style: style }];
}

// Génère le style CSS inline pour un élément positionné librement
function posStyle(key, slide, extra = '') {
  if (slide[`${key}X`] === undefined) return '';
  return `position:absolute;left:${slide[`${key}X`]}%;top:${slide[`${key}Y`]}%;width:${slide[`${key}W`] ?? 80}%;margin:0;max-width:none;${extra}`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export async function renderSlides(script, slides, draftDir) {
  const templatePath = path.join(process.cwd(), 'templates', `${script.template}.html`);
  const tpl = await fs.readFile(templatePath, 'utf-8');

  console.log(`[render] Lancement de Puppeteer...`);
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1080, height: 1350, deviceScaleFactor: 2 });

    const total = slides.length;
    const outputs = [];

    for (let i = 0; i < slides.length; i++) {
      const outPath = path.join(draftDir, `slide-${String(i + 1).padStart(2, '0')}.png`);
      await renderSlideOnPage(page, tpl, slides[i], i, total, outPath);
      outputs.push(outPath);
      console.log(`[render] ✓ slide ${i + 1}/${total}`);
    }

    return outputs;
  } finally {
    await browser.close();
  }
}

// Génère UNE slide (utilisé par l'éditeur live)
export async function renderSingleSlide(script, slide, slideIndex, totalSlides, outPath) {
  const templatePath = path.join(process.cwd(), 'templates', `${script.template}.html`);
  const tpl = await fs.readFile(templatePath, 'utf-8');

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1080, height: 1350, deviceScaleFactor: 2 });
    await renderSlideOnPage(page, tpl, slide, slideIndex, totalSlides, outPath);
    return outPath;
  } finally {
    await browser.close();
  }
}

async function renderSlideOnPage(page, tpl, slide, i, total, outPath) {
  const isLast = i === total - 1;
  const titleStyle = posStyle('title', slide);
  const bodyStyle  = posStyle('body', slide);
  const statStyle  = posStyle('stat', slide);
  const imageStyle = posStyle('image', slide, 'max-height:none;height:auto;border-radius:8px;object-fit:contain;');

  const data = {
    title_lines: buildTitleHtml(slide.title, slide.highlight, titleStyle),
    body: slide.body || '',
    body_style: bodyStyle,
    stat: slide.stat || '',
    stat_style: statStyle,
    image: slide.imageFile ? `file://${slide.imageFile.replace(/\\/g, '/')}` : '',
    image_style: imageStyle,
    missing_image_note: slide.missingImageNote || '',
    footer_text: isLast ? 'Follow for more' : i === 0 ? 'Swipe to Know More' : '',
    footer_left: !isLast && i > 0,
    slide_number: String(i + 1).padStart(2, '0'),
    total_slides: String(total).padStart(2, '0'),
  };

  const html = renderTemplate(tpl, data);
  await page.setContent(html, { waitUntil: 'networkidle0' });
  await new Promise((r) => setTimeout(r, 300));

  await page.screenshot({
    path: outPath,
    type: 'png',
    fullPage: false,
    clip: { x: 0, y: 0, width: 1080, height: 1350 },
  });
}
