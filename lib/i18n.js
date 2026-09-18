/**
* Language per request.
*
* The explorer was built for one language per instance: settings.locale names a
* file, lib/locale.js reads it once at startup, and app.set('locale', ...) hands
* that one object to every view. This module keeps that as the fallback and adds
* a choice per request.
*
* Views need no change. Express puts its app settings into app.locals.settings,
* which is why templates can say settings.locale.confirmations; res.locals is
* merged after app.locals, so a per-request copy of that object with a different
* locale shadows the global one for exactly that response.
*
* The order is deliberate:
*   1. ?lang=de   -- explicit, and therefore shareable: a link can carry the
*                    language, which a cookie never can.
*   2. cookie     -- what this visitor chose last time.
*   3. Accept-Language -- what the browser asks for, before anyone has chosen.
*   4. settings.locale -- the instance default.
*/

var fs = require('fs');
var path = require('path');
var jsonminify = require('jsonminify');
var settings = require('./settings');

var DIR = path.join(__dirname, '..', 'locale');
var cache = {};

// The instance default, taken from settings.locale ("locale/en.json" -> "en").
var DEFAULT = path.basename(String(settings.locale || 'en.json'), '.json') || 'en';

function readDict(lang) {
  var file = path.join(DIR, lang + '.json');
  // Locale files carry comments, like settings.json does.
  var text = jsonminify(fs.readFileSync(file, 'utf8')).replace(/,]/g, ']').replace(/,}/g, '}');
  return JSON.parse(text);
}

// Which languages this instance actually ships. Read once at startup: a missing
// or broken file should be loud here, not on a random request.
var available = fs.readdirSync(DIR)
  .filter(function (f) { return /\.json$/.test(f) && f.indexOf('.template') === -1; })
  .map(function (f) { return path.basename(f, '.json'); })
  .filter(function (lang) {
    try { cache[lang] = readDict(lang); return true; }
    catch (e) { console.warn('locale ' + lang + ' ignored: ' + e.message); return false; }
  });

if (available.indexOf(DEFAULT) === -1 && available.length) DEFAULT = available[0];

function dict(lang) {
  return cache[lang] || cache[DEFAULT] || {};
}

function supported(lang) {
  if (!lang) return null;
  lang = String(lang).toLowerCase();
  if (available.indexOf(lang) !== -1) return lang;
  // "de-DE" and "de_AT" both mean the "de" file we ship.
  var base = lang.split(/[-_]/)[0];
  return available.indexOf(base) !== -1 ? base : null;
}

/**
* Accept-Language, by quality. "de-DE,de;q=0.9,en;q=0.8" -> de.
* A malformed q is treated as the default 1, which is what browsers mean.
*/
function fromHeader(header) {
  if (!header) return null;
  var ranked = String(header).split(',').map(function (part, i) {
    var bits = part.trim().split(';');
    var q = 1;
    for (var j = 1; j < bits.length; j++) {
      var m = /^\s*q\s*=\s*([0-9.]+)\s*$/.exec(bits[j]);
      if (m && !isNaN(parseFloat(m[1]))) q = parseFloat(m[1]);
    }
    return { tag: bits[0].trim(), q: q, i: i };
  }).filter(function (e) { return e.tag && e.q > 0; });

  ranked.sort(function (a, b) { return b.q - a.q || a.i - b.i; });

  for (var k = 0; k < ranked.length; k++) {
    if (ranked[k].tag === '*') break;
    var hit = supported(ranked[k].tag);
    if (hit) return hit;
  }
  return null;
}

/**
* Returns {lang, explicit}. `explicit` marks a ?lang= choice, which the caller
* stores in the cookie -- a header or a cookie is not a new decision.
*/
function resolve(req) {
  var fromQuery = supported(req.query && req.query.lang);
  if (fromQuery) return { lang: fromQuery, explicit: true };

  var fromCookie = supported(req.cookies && req.cookies.lang);
  if (fromCookie) return { lang: fromCookie, explicit: false };

  var fromBrowser = fromHeader(req.headers && req.headers['accept-language']);
  if (fromBrowser) return { lang: fromBrowser, explicit: false };

  return { lang: DEFAULT, explicit: false };
}

module.exports = {
  available: available,
  DEFAULT: DEFAULT,
  dict: dict,
  resolve: resolve,
  supported: supported,
  fromHeader: fromHeader
};
