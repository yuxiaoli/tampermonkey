// ==UserScript==
// @name         Copy HTML / Clean HTML / Markdown (Turndown) - FA Copy Icon + Busy Border
// @namespace    https://tampermonkey.net/
// @version      2.3
// @description  Copy original DOM HTML (without our UI), clean HTML, or Markdown converted from cleaned DOM. Uses a Font Awesome copy icon button. Busy indicator is a circular spinner using ONLY the button border.
// @match        *://*/*
// @run-at       document-end
// @require      https://cdn.jsdelivr.net/npm/turndown@7.2.0/dist/turndown.js
// @grant        GM_setClipboard
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_addStyle
// @grant        unsafeWindow
// ==/UserScript==

(function () {
  'use strict';

  /* =========================
     CONFIG
     ========================= */
  const MODE_KEY = 'copy_html_mode';            // 'original' | 'clean' | 'markdown'
  const WAIT_STABLE_KEY = 'copy_wait_dom_stable';

  // Hotkeys:
  // Ctrl/Cmd+Shift+Y => copy by mode
  // Ctrl/Cmd+Shift+O => original
  // Ctrl/Cmd+Shift+C => clean
  // Ctrl/Cmd+Shift+M => markdown
  const HK_BY_MODE = { primary: true, shift: true, alt: false, key: 'Y' };
  const HK_ORIG    = { primary: true, shift: true, alt: false, key: 'O' };
  const HK_CLEAN   = { primary: true, shift: true, alt: false, key: 'C' };
  const HK_MD      = { primary: true, shift: true, alt: false, key: 'M' };

  // UI markers
  const BTN_ID    = '__tm_copy_html_btn__';
  const BTN_STYLE_ID = '__tm_copy_html_btn_style__';
  const ICON_STYLE_ID = '__tm_copy_html_icon_style__';

  // Layout
  const UI_RIGHT = 12;  // px
  const UI_BOTTOM = 12; // px

  function logError(err) {
    try { console.error('[CopyHTML]', err); } catch (_) {}
  }

  /* =========================
     Clipboard
     ========================= */
  async function setClipboard(text) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (_) {}

    try {
      GM_setClipboard(text, { type: 'text', mimetype: 'text/plain' });
      return true;
    } catch (_) {}

    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.top = '-9999px';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch (_) {
      return false;
    }
  }

  /* =========================
     Hotkeys + mode
     ========================= */
  function isTypingTarget(target) {
    const tag = (target.tagName || '').toLowerCase();
    return tag === 'input' || tag === 'textarea' || target.isContentEditable;
  }

  function matchesHotkey(e, hk) {
    const primaryPressed = e.ctrlKey || e.metaKey;
    return (!!hk.primary === primaryPressed) &&
      (!!hk.shift === e.shiftKey) &&
      (!!hk.alt === e.altKey) &&
      (e.key.toUpperCase() === hk.key.toUpperCase());
  }

  function getMode() {
    const m = GM_getValue(MODE_KEY, 'clean');
    return (m === 'original' || m === 'clean' || m === 'markdown') ? m : 'clean';
  }
  function setMode(m) { GM_setValue(MODE_KEY, m); }

  function shouldWaitStable() { return !!GM_getValue(WAIT_STABLE_KEY, true); }
  function setWaitStable(v) { GM_setValue(WAIT_STABLE_KEY, !!v); }

  function getModeLabelShort(mode) {
    // For tooltip only
    if (mode === 'original') return 'Original';
    if (mode === 'markdown') return 'Markdown';
    return 'Clean';
  }

  /* =========================
     DOM stability wait (SPAs)
     ========================= */
  function waitForDomStable({ quietMs = 800, timeoutMs = 4000 } = {}) {
    return new Promise((resolve) => {
      let lastChange = Date.now();
      const start = Date.now();

      const obs = new MutationObserver(() => { lastChange = Date.now(); });
      obs.observe(document.documentElement, { childList: true, subtree: true, attributes: true, characterData: true });

      const tick = () => {
        const now = Date.now();
        if ((now - lastChange) >= quietMs || (now - start) >= timeoutMs) {
          obs.disconnect();
          resolve();
          return;
        }
        setTimeout(tick, 120);
      };
      setTimeout(tick, 120);
    });
  }

  async function maybeWait() {
    if (shouldWaitStable()) await waitForDomStable();
  }

  /* =========================
     Builders (exclude ALL UI)
     ========================= */
  function stripOurUIFromClone(rootClone) {
    rootClone.querySelectorAll(`#${CSS.escape(BTN_ID)}`).forEach(el => el.remove());
    rootClone.querySelectorAll(`#${CSS.escape(BTN_STYLE_ID)}`).forEach(el => el.remove());
    rootClone.querySelectorAll(`#${CSS.escape(ICON_STYLE_ID)}`).forEach(el => el.remove());

    // Defensive: remove any style node that contains our selector / keyframes
    rootClone.querySelectorAll('style').forEach(st => {
      const txt = st.textContent || '';
      if (
        txt.includes(`#${BTN_ID}`) ||
        txt.includes('__tm_btn_spin') ||
        txt.includes('__tm_copy_icon_svg')
      ) st.remove();
    });
  }

  function cloneCurrentDomWithoutOurUI() {
    const clone = document.documentElement.cloneNode(true);
    stripOurUIFromClone(clone);
    return clone;
  }

  function buildOriginalHTML() {
    return cloneCurrentDomWithoutOurUI().outerHTML;
  }

  function buildCleanDomRoot() {
    const clone = cloneCurrentDomWithoutOurUI();
    clone.querySelectorAll('script').forEach(el => el.remove());
    clone.querySelectorAll('style').forEach(el => el.remove());
    clone.querySelectorAll('link[rel="stylesheet"]').forEach(el => el.remove());
    clone.querySelectorAll('[style]').forEach(el => el.removeAttribute('style'));
    return clone.querySelector('body') || clone;
  }

  function buildCleanHTML() {
    const clone = cloneCurrentDomWithoutOurUI();
    clone.querySelectorAll('script').forEach(el => el.remove());
    clone.querySelectorAll('style').forEach(el => el.remove());
    clone.querySelectorAll('link[rel="stylesheet"]').forEach(el => el.remove());
    clone.querySelectorAll('[style]').forEach(el => el.removeAttribute('style'));
    return '<!DOCTYPE html>\n' + clone.outerHTML;
  }

  /* =========================
     Turndown
     ========================= */
  function getTurndownCtor() {
    if (typeof globalThis !== 'undefined' && typeof globalThis.TurndownService === 'function') return globalThis.TurndownService;
    if (typeof TurndownService === 'function') return TurndownService;
    try {
      if (typeof unsafeWindow !== 'undefined' && typeof unsafeWindow.TurndownService === 'function') return unsafeWindow.TurndownService;
    } catch (_) {}
    return null;
  }

  function domToMarkdown(rootEl) {
    const TurndownCtor = getTurndownCtor();
    if (!TurndownCtor) throw new Error('TurndownService not found. @require may be blocked.');
    const service = new TurndownCtor({ headingStyle: 'atx', codeBlockStyle: 'fenced', emDelimiter: '_' });
    const md = service.turndown(rootEl);
    return md.replace(/\n{3,}/g, '\n\n').trim() + '\n';
  }

  /* =========================
     Copy actions
     ========================= */
  async function copyOriginal() {
    await maybeWait();
    const ok = await setClipboard(buildOriginalHTML());
    if (!ok) throw new Error('Copy failed (original HTML).');
  }

  async function copyClean() {
    await maybeWait();
    const ok = await setClipboard(buildCleanHTML());
    if (!ok) throw new Error('Copy failed (clean HTML).');
  }

  async function copyMarkdown() {
    await maybeWait();
    const root = buildCleanDomRoot();
    const md = domToMarkdown(root);
    const ok = await setClipboard(md);
    if (!ok) throw new Error('Copy failed (markdown).');
  }

  async function copyByMode() {
    const mode = getMode();
    if (mode === 'original') return copyOriginal();
    if (mode === 'markdown') return copyMarkdown();
    return copyClean();
  }

  /* =========================
     Busy indicator: rounded-square spinner using ONLY the button border
     - We animate the border by rotating a pseudo-element around the button.
     - No separate loader element.
     ========================= */
  function setBusy(isBusy) {
    const btn = document.getElementById(BTN_ID);
    if (!btn) return;
    if (isBusy) btn.setAttribute('data-busy', '1');
    else btn.removeAttribute('data-busy');
  }

  async function withBusy(fn) {
    setBusy(true);
    try {
      return await fn();
    } finally {
      setBusy(false);
    }
  }

  /* =========================
     Icon: Font Awesome "copy" (solid)
     We inline an SVG that matches that icon, so we don't need FA CSS kits.
     Reference: https://fontawesome.com/icons/copy?s=solid
     ========================= */
  function createCopyIconSvg() {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 448 512');
    svg.setAttribute('width', '16');
    svg.setAttribute('height', '16');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    svg.classList.add('__tm_copy_icon_svg');

    // Path data for FA "copy" (solid)
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', 'M384 336l-192 0c-8.8 0-16-7.2-16-16l0-256c0-8.8 7.2-16 16-16l140.1 0c4.2 0 8.3 1.7 11.3 4.7l40 40c3 3 4.7 7.1 4.7 11.3l0 216c0 8.8-7.2 16-16 16zM192 368l192 0c26.5 0 48-21.5 48-48l0-216c0-12.7-5.1-24.9-14.1-33.9l-40-40C368.9 21.1 356.7 16 344 16L192 16c-26.5 0-48 21.5-48 48l0 256c0 26.5 21.5 48 48 48zM64 128c-35.3 0-64 28.7-64 64L0 448c0 35.3 28.7 64 64 64l192 0c35.3 0 64-28.7 64-64l0-32-32 0 0 32c0 17.7-14.3 32-32 32L64 480c-17.7 0-32-14.3-32-32l0-256c0-17.7 14.3-32 32-32l32 0 0-32-32 0z');
    svg.appendChild(path);
    return svg;
  }

  /* =========================
     UI: icon button
     ========================= */
  function addButton() {
    const btn = document.createElement('button');
    btn.id = BTN_ID;
    btn.type = 'button';

    // Ensure button text is empty: only icon, so "Do not copy the text of this button"
    btn.textContent = '';

    // Icon
    btn.appendChild(createCopyIconSvg());

    // Click -> copy by mode with busy border
    btn.addEventListener('click', () => withBusy(async () => {
      try { await copyByMode(); } catch (e) { logError(e); }
    }));

    document.documentElement.appendChild(btn);

    // Keep tooltip updated
    function refreshTitle() {
      const mode = getMode();
      btn.title =
        `Mode: ${getModeLabelShort(mode)}\n` +
        `Click: copy by mode\n` +
        `Ctrl/Cmd+Shift+Y: by mode\n` +
        `Ctrl/Cmd+Shift+O: original\n` +
        `Ctrl/Cmd+Shift+C: clean\n` +
        `Ctrl/Cmd+Shift+M: markdown\n` +
        `Wait DOM stable: ${shouldWaitStable() ? 'ON' : 'OFF'}`;
    }
    refreshTitle();
    setInterval(refreshTitle, 900);

    // Styles: icon button + busy border spinner (rounded square)
    GM_addStyle(`
      /* Button */
      #${BTN_ID}{
        position:fixed;
        right:${UI_RIGHT}px;
        bottom:${UI_BOTTOM}px;
        z-index:2147483647;
        width:36px;
        height:36px;
        display:flex;
        align-items:center;
        justify-content:center;

        border-radius:10px; /* rounded square */
        border:2px solid rgba(0,0,0,0.22);
        background:rgba(255,255,255,0.92);
        color:#111;
        cursor:pointer;
        user-select:none;
        box-shadow:0 6px 18px rgba(0,0,0,0.15);
        padding:0;
        line-height:1;
      }
      #${BTN_ID}:active{ transform:translateY(1px); }

      /* Icon inherits currentColor */
      #${BTN_ID} .__tm_copy_icon_svg{
        display:block;
        width:16px;
        height:16px;
        fill: currentColor;
        opacity: 0.9;
      }

      /* Busy indicator: Circular spinner overlay (smoother than rotating square).
         We draw a border via pseudo-element, make one side darker, then rotate it. */
      #${BTN_ID}[data-busy="1"]{
        /* Keep button clickable? You can disable click by uncommenting:
        pointer-events:none;
        */
      }
      #${BTN_ID}[data-busy="1"]::after{
        content:"";
        position:absolute;
        inset:-2px;              /* slightly outside to cover border */
        border-radius:50%;       /* circle to avoid wobble */
        border:2px solid rgba(0, 200, 90, 0.22);
        border-top-color: rgba(0, 200, 90, 0.95);
        border-right-color: rgba(0, 200, 90, 0.55);
        border-bottom-color: rgba(0, 200, 90, 0.22);
        border-left-color: rgba(0, 200, 90, 0.22);
        animation: __tm_btn_spin 0.75s linear infinite;
        pointer-events:none;
      }
      @keyframes __tm_btn_spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
    `);

    // Tag our injected style node(s) so we can remove them from captured HTML
    setTimeout(() => {
      const styles = Array.from(document.querySelectorAll('style'));
      const btnStyle = styles.find(s => (s.textContent || '').includes(`#${BTN_ID}{`) && (s.textContent || '').includes('__tm_btn_spin'));
      if (btnStyle) btnStyle.id = BTN_STYLE_ID;

      const iconStyle = styles.find(s => (s.textContent || '').includes('.__tm_copy_icon_svg'));
      if (iconStyle && iconStyle !== btnStyle) iconStyle.id = ICON_STYLE_ID;
    }, 0);
  }

  function registerMenu() {
    GM_registerMenuCommand('Set mode: Original HTML', () => setMode('original'));
    GM_registerMenuCommand('Set mode: Clean HTML', () => setMode('clean'));
    GM_registerMenuCommand('Set mode: Markdown', () => setMode('markdown'));
    GM_registerMenuCommand(`Wait for DOM stable: ${shouldWaitStable() ? 'ON' : 'OFF'} (toggle)`, () => setWaitStable(!shouldWaitStable()));
  }

  function registerHotkeys() {
    document.addEventListener('keydown', (e) => {
      if (isTypingTarget(e.target)) return;

      const run = (fn) => withBusy(async () => {
        try { await fn(); } catch (err) { logError(err); }
      });

      if (matchesHotkey(e, HK_BY_MODE)) { e.preventDefault(); run(copyByMode); return; }
      if (matchesHotkey(e, HK_ORIG))    { e.preventDefault(); run(copyOriginal); return; }
      if (matchesHotkey(e, HK_CLEAN))   { e.preventDefault(); run(copyClean); return; }
      if (matchesHotkey(e, HK_MD))      { e.preventDefault(); run(copyMarkdown); }
    });
  }

  /* =========================
     INIT
     - show busy border briefly while loading plugin
     ========================= */
  async function init() {
    registerMenu();
    registerHotkeys();
    addButton();

    // Show busy border briefly on init (so you can tell it loaded)
    setBusy(true);
    setTimeout(() => setBusy(false), 650);
  }

  init().catch(logError);
})();