/*
  client/boost-audio.js

  Client helper that creates a local <audio> element, connects it to the
  Web Audio API and provides a small UI to enable amplification (Gain + Compressor).

  Usage (static files served from your webroot):
  - Include <script src="/client/boost-audio.js"></script> in your index.html
  - Call BoostAudio.init({ proxyOrigin: 'https://your.proxy', defaultVideoId: '...' })
  - Or call BoostAudio.connectVideoId('VIDEO_ID') to point the audio element to the
    proxy endpoint: e.g. https://your.proxy/stream?videoId=VIDEO_ID

  Important: the proxy server must send Access-Control-Allow-Origin so that
  createMediaElementSource() can be used without CORS errors.
*/

(function (global) {
  const STORAGE_KEY = 'sbixify_boost_gain';
  const STORAGE_ENABLED = 'sbixify_boost_enabled';

  function createUI() {
    const container = document.createElement('div');
    container.id = 'sbixify-boost-ui';
    container.style.position = 'fixed';
    container.style.right = '18px';
    container.style.bottom = '18px';
    container.style.background = 'rgba(13,14,18,0.9)';
    container.style.border = '1px solid rgba(255,255,255,0.06)';
    container.style.padding = '10px';
    container.style.borderRadius = '12px';
    container.style.zIndex = '10000';
    container.style.display = 'flex';
    container.style.gap = '8px';
    container.style.alignItems = 'center';

    const enableBtn = document.createElement('button');
    enableBtn.textContent = 'Boost';
    enableBtn.style.padding = '6px 10px';
    enableBtn.style.borderRadius = '8px';
    enableBtn.style.border = 'none';
    enableBtn.style.background = '#FF9A21';
    enableBtn.style.color = '#0B0B0E';
    enableBtn.style.fontWeight = '700';

    const range = document.createElement('input');
    range.type = 'range';
    range.min = '0';
    range.max = '3';
    range.step = '0.01';
    range.value = localStorage.getItem(STORAGE_KEY) || '1.6';
    range.title = 'Gain';
    range.style.width = '120px';

    container.appendChild(enableBtn);
    container.appendChild(range);

    document.body.appendChild(container);

    return { enableBtn, range };
  }

  class BoostAudioClass {
    constructor() {
      this.audioEl = null;
      this.audioCtx = null;
      this.sourceNode = null;
      this.gainNode = null;
      this.compressor = null;
      this.ui = null;
      this.proxyOrigin = '';
      this.defaultVideoId = null;
      this.enabled = localStorage.getItem(STORAGE_ENABLED) === '1';
    }

    init(opts = {}) {
      this.proxyOrigin = opts.proxyOrigin || '';
      this.defaultVideoId = opts.defaultVideoId || null;

      // Create or find audio element
      this.audioEl = document.getElementById('localAudio');
      if (!this.audioEl) {
        this.audioEl = document.createElement('audio');
        this.audioEl.id = 'localAudio';
        this.audioEl.controls = true;
        this.audioEl.crossOrigin = 'anonymous';
        this.audioEl.style.position = 'fixed';
        this.audioEl.style.left = '18px';
        this.audioEl.style.bottom = '18px';
        this.audioEl.style.zIndex = '10000';
        document.body.appendChild(this.audioEl);
      }

      this.ui = createUI();
      this.ui.enableBtn.addEventListener('click', async () => {
        await this.enable();
      });
      this.ui.range.addEventListener('input', () => {
        const v = parseFloat(this.ui.range.value);
        if (this.gainNode) this.gainNode.gain.value = v;
        localStorage.setItem(STORAGE_KEY, String(v));
      });

      if (this.defaultVideoId) this.connectVideoId(this.defaultVideoId);
      if (this.enabled) this.ui.enableBtn.click();
    }

    connectVideoId(videoId) {
      const origin = this.proxyOrigin || window.location.origin;
      const url = `${origin.replace(/\/+$/, '')}/stream?videoId=${encodeURIComponent(videoId)}`;
      this.setSrc(url);
    }

    setSrc(url) {
      if (!this.audioEl) return;
      this.audioEl.src = url;
      this.audioEl.crossOrigin = 'anonymous';
    }

    async enable() {
      if (!this.audioEl) {
        alert('Nessun elemento audio trovato');
        return;
      }
      if (!this.audioCtx) {
        try {
          this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        } catch (err) {
          console.error('AudioContext error', err);
          alert('AudioContext non disponibile');
          return;
        }

        try {
          this.sourceNode = this.audioCtx.createMediaElementSource(this.audioEl);
        } catch (err) {
          console.error('createMediaElementSource failed (CORS?):', err);
          alert('Impossibile creare MediaElementSource. Assicurati che il server proxy risponda con Access-Control-Allow-Origin.');
          return;
        }

        this.gainNode = this.audioCtx.createGain();
        const savedGain = parseFloat(localStorage.getItem(STORAGE_KEY) || '1.6');
        this.gainNode.gain.value = savedGain;

        this.compressor = this.audioCtx.createDynamicsCompressor();
        this.compressor.threshold.setValueAtTime(-6, this.audioCtx.currentTime);
        this.compressor.knee.setValueAtTime(20, this.audioCtx.currentTime);
        this.compressor.ratio.setValueAtTime(8, this.audioCtx.currentTime);
        this.compressor.attack.setValueAtTime(0.003, this.audioCtx.currentTime);
        this.compressor.release.setValueAtTime(0.25, this.audioCtx.currentTime);

        this.sourceNode.connect(this.gainNode).connect(this.compressor).connect(this.audioCtx.destination);
      }

      if (this.audioCtx.state === 'suspended') await this.audioCtx.resume();
      try { await this.audioEl.play(); } catch (e) { console.warn('play failed', e); }
      localStorage.setItem(STORAGE_ENABLED, '1');
      this.enabled = true;
    }
  }

  const BoostAudio = new BoostAudioClass();

  // Expose to global
  global.BoostAudio = BoostAudio;
  if (!global.BoostAudioInit) global.BoostAudioInit = (opts) => BoostAudio.init(opts);

})(window);
