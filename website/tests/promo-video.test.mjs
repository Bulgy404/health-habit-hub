import assert from 'node:assert/strict';
import test from 'node:test';
import { schedulePromoAutoplay } from '../src/lib/promo-video.mjs';

function fixture(t, { hidden = false, blocked = false } = {}) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const video = new EventTarget();
  video.muted = false;
  video.play = t.mock.fn(() => {
    if (blocked) return Promise.reject(new Error('Autoplay blocked'));
    video.dispatchEvent(new Event('play'));
    return Promise.resolve();
  });
  const page = Object.assign(new EventTarget(), { hidden });
  const browser = Object.assign(new EventTarget(), {
    setTimeout: (callback, delay) => setTimeout(callback, delay),
    clearTimeout: (timer) => clearTimeout(timer),
  });
  schedulePromoAutoplay(video, page, browser);
  return { video, page, browser };
}

test('waits two seconds and starts with sound muted', (t) => {
  const { video } = fixture(t);
  t.mock.timers.tick(1999);
  assert.equal(video.play.mock.callCount(), 0);
  t.mock.timers.tick(1);
  assert.equal(video.play.mock.callCount(), 1);
  assert.equal(video.muted, true);
  t.mock.timers.tick(10000);
  assert.equal(video.play.mock.callCount(), 1);
});

test('waits for a hidden tab to become visible and starts only once', (t) => {
  const { video, page } = fixture(t, { hidden: true });
  t.mock.timers.tick(2000);
  page.dispatchEvent(new Event('visibilitychange'));
  assert.equal(video.play.mock.callCount(), 0);
  page.hidden = false;
  page.dispatchEvent(new Event('visibilitychange'));
  assert.equal(video.play.mock.callCount(), 1);
  page.dispatchEvent(new Event('visibilitychange'));
  assert.equal(video.play.mock.callCount(), 1);
});

test('becoming visible before the delay does not start playback early', (t) => {
  const { video, page } = fixture(t, { hidden: true });
  t.mock.timers.tick(500);
  page.hidden = false;
  page.dispatchEvent(new Event('visibilitychange'));
  assert.equal(video.play.mock.callCount(), 0);
  t.mock.timers.tick(1500);
  assert.equal(video.play.mock.callCount(), 1);
});

for (const event of ['play', 'pointerdown', 'keydown']) {
  test(`${event} during the delay cancels autoplay without muting the visitor`, (t) => {
    const { video } = fixture(t);
    video.dispatchEvent(new Event(event));
    t.mock.timers.tick(3000);
    assert.equal(video.play.mock.callCount(), 0);
    assert.equal(video.muted, false);
  });
}

test('manual interaction also cancels a start waiting for visibility', (t) => {
  const { video, page } = fixture(t, { hidden: true });
  t.mock.timers.tick(2000);
  video.dispatchEvent(new Event('pointerdown'));
  page.hidden = false;
  page.dispatchEvent(new Event('visibilitychange'));
  assert.equal(video.play.mock.callCount(), 0);
});

test('leaving the page cancels a start waiting for visibility', (t) => {
  const { video, page, browser } = fixture(t, { hidden: true });
  t.mock.timers.tick(2000);
  browser.dispatchEvent(new Event('pagehide'));
  page.hidden = false;
  page.dispatchEvent(new Event('visibilitychange'));
  assert.equal(video.play.mock.callCount(), 0);
});

test('handles rejected autoplay without an unhandled rejection or retry', async (t) => {
  const { video, page } = fixture(t, { blocked: true });
  t.mock.timers.tick(2000);
  await Promise.resolve();
  page.dispatchEvent(new Event('visibilitychange'));
  t.mock.timers.tick(10000);
  assert.equal(video.play.mock.callCount(), 1);
});
