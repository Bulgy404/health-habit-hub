/** Schedule one muted start, while respecting visibility and manual playback. */
export function schedulePromoAutoplay(video, page = document, browser = window) {
  let pending = true;
  const cancel = () => {
    pending = false;
    browser.clearTimeout(timer);
    page.removeEventListener('visibilitychange', start);
  };
  const start = () => {
    if (!pending || page.hidden) return;
    cancel();
    // A rejected autoplay leaves the native play button available.
    video.muted = true;
    void video.play().catch(() => {});
  };
  const timer = browser.setTimeout(() => {
    if (page.hidden) page.addEventListener('visibilitychange', start);
    else start();
  }, 2000);

  for (const event of ['play', 'pointerdown', 'keydown']) {
    video.addEventListener(event, cancel, { once: true });
  }
  browser.addEventListener('pagehide', cancel, { once: true });
  return cancel;
}
