// Keep controls outside the scientific image: native overlays shade paused frames.
const formatTime = seconds => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
for (const player of document.querySelectorAll('[data-movie-player]')) {
  const video = player.querySelector('video');
  const controls = player.querySelector('.movie-controls');
  const play = player.querySelector('[data-play]');
  const seek = player.querySelector('[data-seek]');
  const time = player.querySelector('[data-time]');
  const fullscreen = player.querySelector('[data-fullscreen]');
  const error = player.querySelector('.movie-error');
  const title = video.getAttribute('aria-label');
  const update = () => {
    play.textContent = video.paused ? 'Play' : 'Pause';
    play.setAttribute('aria-label', `${video.paused ? 'Play' : 'Pause'} ${title}`);
    if (Number.isFinite(video.duration)) {
      seek.disabled = false;
      seek.max = video.duration;
      seek.value = video.currentTime;
      seek.setAttribute('aria-valuetext', `${formatTime(video.currentTime)} of ${formatTime(video.duration)}`);
      time.textContent = `${formatTime(video.currentTime)} / ${formatTime(video.duration)}`;
    }
  };
  const toggle = async () => {
    if (!video.paused) { video.pause(); return; }
    error.hidden = true;
    try { await video.play(); } catch { error.hidden = false; }
  };
  play.addEventListener('click', toggle);
  video.addEventListener('click', toggle);
  video.addEventListener('play', () => {
    for (const other of document.querySelectorAll('[data-movie-player] video')) {
      if (other !== video) other.pause();
    }
    update();
  });
  for (const event of ['pause', 'ended', 'loadedmetadata', 'timeupdate']) video.addEventListener(event, update);
  video.addEventListener('error', () => { error.hidden = false; });
  seek.addEventListener('input', () => { video.currentTime = Number(seek.value); update(); });
  if (player.requestFullscreen) {
    fullscreen.addEventListener('click', async () => {
      try {
        if (document.fullscreenElement === player) await document.exitFullscreen();
        else await player.requestFullscreen();
      } catch { /* Playback and download remain available if fullscreen is denied. */ }
    });
    document.addEventListener('fullscreenchange', () => {
      fullscreen.textContent = document.fullscreenElement === player ? 'Exit full screen' : 'Full screen';
      fullscreen.setAttribute('aria-label', `${fullscreen.textContent}: ${title}`);
    });
  } else if (video.webkitEnterFullscreen) {
    fullscreen.addEventListener('click', () => video.webkitEnterFullscreen());
  } else { fullscreen.hidden = true; }
  controls.hidden = false;
  video.controls = false;
  update();
}
