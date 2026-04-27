// src/media.js
// Recherche d'images (Bing + Google Custom Search) et vidéos (YouTube)

const BING_ENDPOINT    = 'https://api.bing.microsoft.com/v7.0/images/search';
const GOOGLE_ENDPOINT  = 'https://www.googleapis.com/customsearch/v1';
const YOUTUBE_ENDPOINT = 'https://www.googleapis.com/youtube/v3/search';

async function searchBingImages(query) {
  const key = process.env.BING_SEARCH_KEY;
  if (!key) return [];
  const q = `${query} chart graph statistics data visualization`;
  try {
    const res = await fetch(
      `${BING_ENDPOINT}?q=${encodeURIComponent(q)}&count=8&safeSearch=Moderate`,
      { headers: { 'Ocp-Apim-Subscription-Key': key } }
    );
    if (!res.ok) { console.warn(`[media] Bing ${res.status}`); return []; }
    const data = await res.json();
    return (data.value || []).map(img => ({
      url: img.contentUrl,
      thumbnail: img.thumbnailUrl,
      title: img.name,
      source: img.hostPageDomainFriendlyName || new URL(img.hostPageUrl).hostname,
      sourceUrl: img.hostPageUrl,
      provider: 'bing',
    }));
  } catch (e) {
    console.warn(`[media] Bing error: ${e.message}`);
    return [];
  }
}

async function searchGoogleImages(query) {
  const key = process.env.GOOGLE_SEARCH_KEY;
  const cx  = process.env.GOOGLE_SEARCH_CX;
  if (!key || !cx) return [];
  const q = `${query} chart graph statistics data visualization`;
  try {
    const res = await fetch(
      `${GOOGLE_ENDPOINT}?key=${key}&cx=${cx}&q=${encodeURIComponent(q)}&searchType=image&num=8`
    );
    if (!res.ok) { console.warn(`[media] Google ${res.status}`); return []; }
    const data = await res.json();
    return (data.items || []).map(item => ({
      url: item.link,
      thumbnail: item.image?.thumbnailLink || item.link,
      title: item.title,
      source: item.displayLink,
      sourceUrl: item.image?.contextLink || item.link,
      provider: 'google',
    }));
  } catch (e) {
    console.warn(`[media] Google error: ${e.message}`);
    return [];
  }
}

async function searchYouTubeVideos(query) {
  const key = process.env.GOOGLE_SEARCH_KEY;
  if (!key) return [];
  try {
    const res = await fetch(
      `${YOUTUBE_ENDPOINT}?key=${key}&q=${encodeURIComponent(query + ' official')}&type=video&part=snippet&maxResults=3&order=relevance`
    );
    if (!res.ok) { console.warn(`[media] YouTube ${res.status}`); return []; }
    const data = await res.json();
    return (data.items || []).map(item => ({
      videoId: item.id.videoId,
      title: item.snippet.title,
      thumbnail: item.snippet.thumbnails?.medium?.url || item.snippet.thumbnails?.default?.url,
      channel: item.snippet.channelTitle,
      watchUrl: `https://www.youtube.com/watch?v=${item.id.videoId}`,
    }));
  } catch (e) {
    console.warn(`[media] YouTube error: ${e.message}`);
    return [];
  }
}

export async function searchMedia(topic) {
  console.log(`[media] Recherche de médias pour : "${topic}"...`);
  const [bingImages, googleImages, videos] = await Promise.all([
    searchBingImages(topic),
    searchGoogleImages(topic),
    searchYouTubeVideos(topic),
  ]);

  // Fusionner Bing + Google, dédupliquer par URL
  const seen = new Set();
  const images = [...bingImages, ...googleImages].filter(img => {
    if (seen.has(img.url)) return false;
    seen.add(img.url);
    return true;
  }).slice(0, 10);

  console.log(`[media] ${images.length} image(s), ${videos.length} vidéo(s) trouvée(s)`);
  return { images, videos };
}
