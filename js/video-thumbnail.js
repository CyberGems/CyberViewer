'use strict';
window.renderVideoThumbnail = url => new Promise(resolve => {
  const video = document.getElementById('source');
  let settled = false;
  const finish = value => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    video.pause(); video.removeAttribute('src'); video.load();
    resolve(value);
  };
  const timer = setTimeout(() => finish(null), 8000);
  const draw = () => {
    if (settled || !video.videoWidth || video.readyState < 2) return;
    try {
      const canvas = document.getElementById('frame');
      const scale = Math.min(canvas.width / video.videoWidth, canvas.height / video.videoHeight);
      const w = video.videoWidth * scale, h = video.videoHeight * scale;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(video, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
      finish(canvas.toDataURL('image/jpeg', 0.8));
    } catch (error) { console.warn('Video thumbnail failed:', error); finish(null); }
  };
  const captureFrame = () => {
    if (settled) return;
    // Seeking can finish before a hardware-decoded frame is presented. Wait
    // for a real video frame, then copy it, instead of caching a black canvas.
    video.requestVideoFrameCallback(draw);
    video.play().catch(error => { console.warn('Video thumbnail playback failed:', error); finish(null); });
  };
  // Start seeking only once the first frame has initialized the demuxer. Some
  // Matroska files reject an initial seek during the metadata-only stage.
  video.onloadeddata = () => {
    const position = Number.isFinite(video.duration) ? Math.min(1, video.duration / 10) : 0;
    if (position > 0) { video.onseeked = captureFrame; video.currentTime = position; }
    else captureFrame();
  };
  video.onerror = () => finish(null);
  video.src = url; video.load();
});
