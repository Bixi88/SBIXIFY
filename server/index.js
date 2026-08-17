// server/index.js
// Minimal Express server to proxy YouTube audio using ytdl-core.
// Exposes two endpoints:
//  - GET /stream?videoId=ID       => streams audio as audio/webm (no transcoding)
//  - GET /stream-mp3?videoId=ID   => streams audio transcoded to MP3 (requires ffmpeg)
// WARNING: Use only for content you have rights to. Proxying YouTube streams may
// violate YouTube Terms of Service.

const express = require('express');
const ytdl = require('ytdl-core');
const cors = require('cors');

let ffmpegAvailable = false;
let ffmpegPath = null;
let ffmpeg = null;
try {
  ffmpeg = require('fluent-ffmpeg');
  ffmpegPath = require('ffmpeg-static');
  ffmpeg.setFfmpegPath(ffmpegPath);
  ffmpegAvailable = true;
} catch (err) {
  // ffmpeg not available; /stream-mp3 will return 501
}

const app = express();
app.use(cors()); // Access-Control-Allow-Origin: *

const PORT = process.env.PORT || 3000;
const HIGH_WATER_MARK = 1 << 25; // 32MB

function safeVideoId(q) {
  if (!q) return null;
  // naive sanitization: accept alphanumerics, - and _
  const m = String(q).match(/^([A-Za-z0-9_\-]{4,})$/);
  return m ? m[1] : null;
}

app.get('/stream', async (req, res) => {
  const videoId = safeVideoId(req.query.videoId);
  if (!videoId) return res.status(400).send('videoId query param required');
  const url = `https://www.youtube.com/watch?v=${videoId}`;

  // Headers to allow browser createMediaElementSource (CORS)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-cache');

  try {
    const stream = ytdl(url, {
      filter: 'audioonly',
      quality: 'highestaudio',
      highWaterMark: HIGH_WATER_MARK
    });

    stream.on('error', (err) => {
      console.error('ytdl error', err);
      if (!res.headersSent) res.status(502).end('ytdl error');
      else res.end();
    });

    // Best-effort Content-Type. Many audio-only streams are webm/opus; browsers
    // generally understand audio/webm. If you know the exact codec you can set
    // a different Content-Type.
    res.setHeader('Content-Type', 'audio/webm');
    stream.pipe(res);
  } catch (err) {
    console.error(err);
    res.status(500).send('internal error');
  }
});

app.get('/stream-mp3', (req, res) => {
  const videoId = safeVideoId(req.query.videoId);
  if (!videoId) return res.status(400).send('videoId query param required');
  if (!ffmpegAvailable) return res.status(501).send('ffmpeg not available on server');
  const url = `https://www.youtube.com/watch?v=${videoId}`;

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Content-Type', 'audio/mpeg');

  const ytStream = ytdl(url, { filter: 'audioonly', quality: 'highestaudio', highWaterMark: HIGH_WATER_MARK });

  ytStream.on('error', (err) => {
    console.error('ytdl error', err);
    try { res.end(); } catch (e) {}
  });

  const proc = ffmpeg(ytStream)
    .format('mp3')
    .audioBitrate(192)
    .on('error', (err) => {
      console.error('ffmpeg error', err);
      try { res.end(); } catch (e) {}
    });

  proc.pipe(res, { end: true });
});

app.get('/', (req, res) => res.send('SBIXIFY ytdl audio proxy')); 

app.listen(PORT, () => console.log(`ytdl proxy listening on :${PORT}`));
