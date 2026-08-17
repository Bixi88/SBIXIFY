SBIXIFY - YouTube audio proxy and client boost

Files added in this branch:
- server/index.js        -> Express + ytdl-core proxy (stream webm)
- server/package.json    -> dependencies + start script
- server/.gitignore
- client/boost-audio.js  -> Client helper to attach audio and enable WebAudio gain+compressor

Quick start (development, local):

1) Server side

  cd server
  npm install
  # If you want MP3 transcoding you need ffmpeg; the package includes ffmpeg-static so
  # it should "just work" on most platforms. If ffmpeg fails, /stream-mp3 will return 501.
  npm start

  The server listens on port 3000 by default. Endpoints:
    GET /stream?videoId=VIDEO_ID    -> stream audio (audio/webm)
    GET /stream-mp3?videoId=VIDEO_ID -> stream audio transcoded to MP3 (requires ffmpeg)

2) Client side

  - Serve the file client/boost-audio.js from your webroot (or copy its contents into
    your app JS bundle).
  - In index.html add: <script src="/client/boost-audio.js"></script>
  - Initialize in a script block or from the console: BoostAudio.init({ proxyOrigin: 'http://localhost:3000', defaultVideoId: 'VIDEO_ID' })

  This will create a local <audio id="localAudio"> element (if not present) and a small
  floating UI with a Boost button and a gain slider. Clicking Boost will create an
  AudioContext and route the audio through a GainNode + DynamicsCompressor.

Notes / Caveats
- Legal: ensure you have the right to proxy/download the YouTube content. This may
  violate YouTube TOS and/or copyright law. Use only for content you own or are
  authorized to use.

- CORS: the proxy sets Access-Control-Allow-Origin: *. This is necessary so the browser
  can call createMediaElementSource() on the audio element.

- Seeking: this simple proxy does not implement HTTP Range handling. Seeking in the
  browser may not behave like a native YouTube player. For full seeking support you'd
  need to implement range requests and proper Content-Length handling (more complex).

- Performance: transcoding to MP3 on-the-fly is CPU-intensive. For production use
  consider pre-transcoding or using a more robust streaming setup.

- Deployment: if you deploy this proxy publicly be cautious about bandwidth and legal risk.

If vuoi, posso:
- aprire una PR con questi file nella tua repo (già fatto su branch feature/ytdl-audio-proxy),
- o aggiornare index.html per includere lo script e posizionare l'audio inline.

Dimmi come vuoi procedere: vuoi che modifichi index.html per includere il client automaticamente?