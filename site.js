const progress = document.getElementById('scroll-progress');
const topLink = document.getElementById('to-top');
const menu = document.getElementById('chapters-menu');

// Swap reviewed text in place so the current section, media state and scroll
// position are preserved. A query parameter also makes the Chinese view shareable.
const chinese = window.originosZh || {};
const textParts = [];
const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
while (walker.nextNode()) {
  const node = walker.currentNode;
  const original = node.nodeValue;
  const key = original.trim();
  if (Object.hasOwn(chinese, key) && !node.parentElement.closest('[data-i18n-control]')) {
    textParts.push({ node, original, translated: chinese[key] });
  }
}
const attributes = [];
document.body.querySelectorAll('[alt], [aria-label], [title]').forEach(element => {
  if (element.closest('[data-i18n-control]')) return;
  ['alt', 'aria-label', 'title'].forEach(name => {
    const original = element.getAttribute(name);
    if (original && Object.hasOwn(chinese, original.trim())) {
      attributes.push({ element, name, original, translated: chinese[original.trim()] });
    }
  });
});
const englishTitle = document.title;
const description = document.querySelector('meta[name="description"]');
const englishDescription = description?.content;
const languageButtons = [...document.querySelectorAll('[data-lang-option]')];

function setLanguage(language, updateAddress = false) {
  const isChinese = language === 'zh';
  textParts.forEach(({ node, original, translated }) => {
    node.nodeValue = isChinese ? translated : original;
  });
  attributes.forEach(({ element, name, original, translated }) => {
    element.setAttribute(name, isChinese ? translated : original);
  });
  document.documentElement.lang = isChinese ? 'zh-CN' : 'en';
  document.title = isChinese ? chinese[englishTitle] : englishTitle;
  if (description) description.content = isChinese ? chinese[englishDescription] : englishDescription;
  languageButtons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.langOption === language)));
  try { localStorage.setItem('originos7-language', language); } catch { /* storage may be disabled */ }
  if (updateAddress) {
    const url = new URL(location.href);
    if (isChinese) url.searchParams.set('lang', 'zh-CN');
    else url.searchParams.delete('lang');
    history.replaceState(null, '', url);
  }
}

const requestedLanguage = new URLSearchParams(location.search).get('lang');
let savedLanguage;
try { savedLanguage = localStorage.getItem('originos7-language'); } catch { /* storage may be disabled */ }
setLanguage(requestedLanguage === 'zh-CN' ? 'zh' : requestedLanguage === 'en' ? 'en' : savedLanguage === 'zh' ? 'zh' : 'en');
languageButtons.forEach(button => button.addEventListener('click', () => setLanguage(button.dataset.langOption, true)));

function updateScroll() {
  const range = document.documentElement.scrollHeight - window.innerHeight;
  progress.style.width = `${range > 0 ? window.scrollY / range * 100 : 0}%`;
  topLink.classList.toggle('visible', window.scrollY > 720);
}

window.addEventListener('scroll', updateScroll, { passive: true });
window.addEventListener('resize', updateScroll);
updateScroll();

menu.querySelectorAll('a').forEach(link => link.addEventListener('click', () => {
  menu.open = false;
}));
document.addEventListener('click', event => {
  if (!menu.contains(event.target)) menu.open = false;
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') menu.open = false;
});

// Each clip plays when its own frame enters view. A feature can have several
// visible clips on a tablet, so none should wait for another clip to leave.
const scrollVideos = [...document.querySelectorAll('[data-scroll-video]')];
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const playback = new Map(scrollVideos.map(video => [video, { visible: false, pending: false, blocked: false }]));

function eligible(video) {
  return playback.get(video).visible && !document.hidden && !reducedMotion.matches;
}

function showPlayFallback(video, visible) {
  const button = video.parentElement.querySelector('.play-fallback');
  if (button) button.hidden = !visible;
}

function tryAutoplay(video) {
  const state = playback.get(video);
  if (!eligible(video) || !video.paused || state.pending || state.blocked) return;

  // Set the native muted-autoplay signals before asking mobile browsers to play.
  video.defaultMuted = true;
  video.muted = true;
  video.playsInline = true;
  video.autoplay = true;
  video.preload = 'auto';
  state.pending = true;
  let result;
  try { result = video.play(); }
  catch (error) { result = Promise.reject(error); }
  Promise.resolve(result).then(() => {
    showPlayFallback(video, false);
    if (!eligible(video)) video.pause();
  }).catch(error => {
    if (!eligible(video) || error?.name === 'AbortError') return;
    state.blocked = true;
    showPlayFallback(video, true);
  }).finally(() => { state.pending = false; });
}

function pauseOutsideView(video) {
  const state = playback.get(video);
  video.autoplay = false;
  video.pause();
  showPlayFallback(video, false);
  state.blocked = false;
}

const videoObserver = new IntersectionObserver(entries => {
  for (const entry of entries) {
    const video = entry.target;
    const state = playback.get(video);
    const wasVisible = state.visible;
    state.visible = entry.isIntersecting && entry.intersectionRatio >= 0.35;
    if (!eligible(video)) pauseOutsideView(video);
    else if (!wasVisible) tryAutoplay(video);
  }
}, { threshold: [0, 0.2, 0.35, 0.55, 0.75, 1], rootMargin: '-64px 0px -5% 0px' });

scrollVideos.forEach(video => {
  videoObserver.observe(video);
  video.addEventListener('canplay', () => tryAutoplay(video));
  video.addEventListener('play', () => {
    playback.get(video).blocked = false;
    showPlayFallback(video, false);
  });
  const fallback = video.parentElement.querySelector('.play-fallback');
  fallback?.addEventListener('click', () => {
    playback.get(video).blocked = false;
    tryAutoplay(video);
  });
});

function refreshVisibleVideos() {
  scrollVideos.forEach(video => {
    if (eligible(video)) tryAutoplay(video);
    else pauseOutsideView(video);
  });
}
document.addEventListener('visibilitychange', refreshVisibleVideos);
reducedMotion.addEventListener('change', refreshVisibleVideos);
// A normal page interaction can unlock autoplay in stricter in-app browsers.
document.addEventListener('pointerdown', () => {
  scrollVideos.forEach(video => {
    const state = playback.get(video);
    if (state.blocked && eligible(video)) {
      state.blocked = false;
      tryAutoplay(video);
    }
  });
});
