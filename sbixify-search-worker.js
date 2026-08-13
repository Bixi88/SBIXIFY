// Worker Cloudflare per SBIXIFY: cerca su YouTube lato server (nessun CORS,
// nessun limite di dimensione risposta come sui proxy CORS gratuiti) e
// restituisce i risultati già normalizzati nel formato che l'app si aspetta.
//
// COME PUBBLICARLO (gratis, 5 minuti):
// 1. Vai su https://dash.cloudflare.com -> Workers e Pages -> Crea -> Worker
// 2. Dagli un nome (es. "sbixify-search"), crea
// 3. Clicca "Modifica codice", cancella tutto e incolla questo intero file
// 4. Clicca "Distribuisci"
// 5. Copia l'URL che ti dà Cloudflare (tipo https://sbixify-search.TUONOME.workers.dev)
// 6. Incollalo in index.html al posto di WORKER_URL (cerca quella riga)
//
// Piano gratuito: 100.000 richieste al giorno, si resetta a mezzanotte UTC.
// Se lo superi (improbabile), il Worker si ferma da solo fino al reset,
// nessun addebito automatico.

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() });
    }

    if (url.pathname !== '/search') {
      return jsonResponse({ error: 'not found' }, 404);
    }

    const q = url.searchParams.get('q') || '';
    const videoDuration = url.searchParams.get('videoDuration') || '';
    if (!q.trim()) return jsonResponse({ error: 'parametro q mancante' }, 400);

    try {
      const ytRes = await fetch(`https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`, {
        headers: {
          // Uno User-Agent "da browser vero" evita che YouTube serva una
          // pagina ridotta/diversa pensata per client non riconosciuti.
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
          'Accept-Language': 'it-IT,it;q=0.9,en;q=0.8'
        }
      });
      if (!ytRes.ok) throw new Error('YouTube ha risposto ' + ytRes.status);
      const html = await ytRes.text();

      const jsonText = extractJsonAfterMarker(html, 'var ytInitialData')
        || extractJsonAfterMarker(html, 'ytInitialData"]')
        || extractJsonAfterMarker(html, 'ytInitialData =');
      if (!jsonText) throw new Error('ytInitialData non trovato nella pagina');
      const data = JSON.parse(jsonText);

      let items = findVideoRenderers(data)
        .filter(v => v && v.videoId && v.title)
        .map(v => {
          const thumbs = (v.thumbnail && v.thumbnail.thumbnails) || [];
          const thumb = thumbs[thumbs.length - 1];
          const titleText = (v.title.runs && v.title.runs[0] && v.title.runs[0].text) || v.title.simpleText || '';
          const channelText = (v.ownerText && v.ownerText.runs && v.ownerText.runs[0] && v.ownerText.runs[0].text)
            || (v.longBylineText && v.longBylineText.runs && v.longBylineText.runs[0] && v.longBylineText.runs[0].text) || '';
          return {
            id: { videoId: v.videoId },
            snippet: {
              title: titleText,
              channelTitle: channelText,
              thumbnails: { high: { url: thumb ? thumb.url : `https://i.ytimg.com/vi/${v.videoId}/mqdefault.jpg` } }
            },
            _durationSec: parseDurationTextToSeconds(v.lengthText && v.lengthText.simpleText)
          };
        });

      if (videoDuration && videoDuration !== 'any') {
        items = items.filter(it => {
          const d = it._durationSec || 0;
          if (videoDuration === 'short') return d > 0 && d < 240;
          if (videoDuration === 'medium') return d >= 240 && d <= 1200;
          if (videoDuration === 'long') return d > 1200;
          return true;
        });
      }
      items = items.map(({ _durationSec, ...rest }) => rest);

      return jsonResponse({ items, nextPageToken: '' });
    } catch (err) {
      return jsonResponse({ error: String((err && err.message) || err) }, 502);
    }
  }
};

function corsHeaders() {
  return {
    // '*' cioè chiamabile da qualsiasi sito. Se un giorno vuoi impedire che
    // altri copino l'URL del tuo Worker in un'altra app, sostituisci '*' con
    // 'https://bixi88.github.io' qui sotto (nelle due righe con questo commento).
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400'
  };
}

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders() }
  });
}

// Stessa logica robusta (conteggio graffe, non regex "lazy") già usata lato
// client per estrarre il blob JSON incorporato nella pagina di YouTube.
function extractJsonAfterMarker(html, marker) {
  const idx = html.indexOf(marker);
  if (idx === -1) return null;
  const start = html.indexOf('{', idx);
  if (start === -1) return null;
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < html.length; i++) {
    const c = html[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') { inStr = true; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return html.slice(start, i + 1); }
  }
  return null;
}

function findVideoRenderers(obj, out) {
  out = out || [];
  if (!obj || typeof obj !== 'object') return out;
  if (obj.videoRenderer) out.push(obj.videoRenderer);
  for (const k in obj) {
    if (k === 'videoRenderer') continue;
    const v = obj[k];
    if (v && typeof v === 'object') findVideoRenderers(v, out);
  }
  return out;
}

function parseDurationTextToSeconds(text) {
  if (!text) return 0;
  const parts = text.split(':').map(n => parseInt(n, 10));
  if (parts.some(isNaN)) return 0;
  return parts.reduce((acc, n) => acc * 60 + n, 0);
}
