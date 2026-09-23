/* The first-visit hint under the search field.
 *
 * It ships hidden and this decides whether to show it, so someone who has
 * already dismissed it never watches it appear and vanish on the next page.
 *
 * It goes away for good on any of three things, because each one means the
 * hint has done its job or will never do it: ticking "do not show again",
 * clicking the example, or simply using the search field.
 *
 * Storage throws in private windows and with site data blocked. A hint is not
 * worth an exception, so every access is guarded and the fallback is to show
 * it -- at worst somebody sees it twice.
 */
(function () {
  'use strict';

  var PREFIX = 'hint-dismissed:';

  function read(key) {
    try { return window.localStorage.getItem(key); } catch (e) { return null; }
  }
  function write(key, value) {
    try { window.localStorage.setItem(key, value); } catch (e) { /* never mind */ }
  }

  document.addEventListener('DOMContentLoaded', function () {
    var hint = document.getElementById('search-hint');
    if (!hint) return;

    var id = hint.getAttribute('data-hint-id');
    var key = PREFIX + (id || 'unknown');
    if (!id || read(key)) return;

    var field = document.querySelector('#index-search input[name="search"]');
    var example = hint.querySelector('.search-hint-example');
    var mute = hint.querySelector('.search-hint-mute-box');

    function dismiss() {
      hint.classList.add('d-none');
      if (field) field.classList.remove('is-hinted');
      write(key, '1');
    }

    // A short wait: the hint should arrive after the page has settled, or it
    // reads as part of the furniture and gets ignored with it.
    window.setTimeout(function () {
      hint.classList.remove('d-none');
      // Added in a second frame so the entry transition has a state to run
      // from; adding it together with the reveal would skip the animation.
      window.requestAnimationFrame(function () {
        window.requestAnimationFrame(function () {
          hint.classList.add('is-shown');
          if (field) field.classList.add('is-hinted');
        });
      });
    }, 900);

    if (mute) mute.addEventListener('change', dismiss);

    if (example && field) {
      example.addEventListener('click', function () {
        field.value = example.textContent.trim();
        dismiss();
        if (field.form) field.form.submit();
      });
    }

    // Using the field is the point of the hint, so it has served its purpose.
    if (field) {
      field.addEventListener('focus', dismiss, { once: true });
    }
  });
}());
