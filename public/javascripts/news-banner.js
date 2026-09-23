/* The news banner on the front page.
 *
 * The markup ships hidden. This decides whether to show it, so a reader who
 * closed it never sees it flash past before the script catches up. The
 * dismissal is stored against the banner's id, so publishing a later item
 * under a new id shows it again to everyone.
 *
 * Storage can throw -- private windows, blocked site data -- and a banner is
 * not worth an exception, so every access is guarded and the fallback is to
 * show it.
 */
(function () {
  'use strict';

  var PREFIX = 'news-dismissed:';

  function read(key) {
    try { return window.localStorage.getItem(key); } catch (e) { return null; }
  }
  function write(key, value) {
    try { window.localStorage.setItem(key, value); } catch (e) { /* not worth it */ }
  }

  document.addEventListener('DOMContentLoaded', function () {
    var banner = document.getElementById('news-banner');
    if (!banner) return;

    var id = banner.getAttribute('data-news-id');
    if (!id || read(PREFIX + id)) return;

    banner.classList.remove('d-none');

    var close = banner.querySelector('.news-close');
    if (close) {
      close.addEventListener('click', function () {
        banner.classList.add('d-none');
        write(PREFIX + id, '1');
      });
    }
  });
}());
