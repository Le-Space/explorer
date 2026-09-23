/**
* The three charts on /mining.
*
* Everything a reader needs is already in the HTML when this runs; these only
* add the shape of it over time. So every failure here is silent in the sense
* that it leaves the page readable -- a chart that cannot be drawn says so in
* its own box rather than throwing and taking the rest with it.
*
* Colours are read from the brand custom properties rather than repeated, so a
* change to the palette reaches the charts too.
*/
(function () {
  'use strict';

  if (typeof Chart === 'undefined') { return; }

  var T = window.MINING_I18N || {};
  var LOCALE = T.locale || 'en-GB';

  function css(name, fallback) {
    try {
      var v = getComputedStyle(document.documentElement).getPropertyValue(name);
      return (v && v.trim()) || fallback;
    } catch (e) { return fallback; }
  }

  var CYAN = css('--ls-cyan', '#58C7F3');
  var CORAL = css('--ls-coral', '#FF6B5B');
  var TEXT = css('--ls-stardust', '#A8B3C7');
  var GRID = css('--ls-horizon', '#232B3D');

  Chart.defaults.color = TEXT;
  Chart.defaults.font.family = 'Inter, -apple-system, "Segoe UI", Roboto, sans-serif';
  Chart.defaults.maintainAspectRatio = false;

  // Alpha as a hex suffix: the palette is opaque, and a fill wants to be seen
  // through. Works because every brand colour is a #rrggbb literal.
  function fade(hex, alpha) {
    var a = Math.round(alpha * 255).toString(16);
    return hex + (a.length < 2 ? '0' + a : a);
  }

  function datePart(unix) {
    return new Date(unix * 1000).toLocaleDateString(LOCALE, {day: '2-digit', month: '2-digit'});
  }
  function timePart(unix) {
    return new Date(unix * 1000).toLocaleTimeString(LOCALE, {hour: '2-digit', minute: '2-digit'});
  }
  function shortTime(unix) {
    return datePart(unix) + ' ' + timePart(unix);
  }

  function say(canvas, message) {
    var box = canvas && canvas.parentNode;
    if (!box) { return; }
    var p = document.createElement('p');
    p.className = 'mining-note mining-empty';
    p.textContent = message;
    box.replaceChild(p, canvas);
  }

  function load(url, onData, canvas) {
    var x = new XMLHttpRequest();
    x.open('GET', url, true);
    x.onreadystatechange = function () {
      if (x.readyState !== 4) { return; }
      var payload = null;
      if (x.status === 200) {
        try { payload = JSON.parse(x.responseText); } catch (e) { payload = null; }
      }
      var rows = payload && payload.data;
      if (!rows || !rows.length) { return say(canvas, T.noData || 'No data.'); }
      try { onData(rows); } catch (e) { say(canvas, T.noData || 'No data.'); }
    };
    x.send();
  }

  var grid = {color: GRID, drawBorder: false};

  // "16.09. 15:34" eight times fits a card on a desktop and collides on a
  // phone, where the same card is a third as wide. Rotating the labels would
  // cost chart height, which is the scarcer thing on that screen, so the axis
  // drops the half that is redundant for its own range instead: a week of
  // points needs the date, a day of points needs the clock.
  //
  // Only the *axis* is shortened. The label a tooltip shows comes from the
  // dataset, so pointing at a bar still gives the full moment.
  var narrow = (window.innerWidth || 1024) < 600;
  function xAxis(keep) {
    return {
      grid: {display: false},
      ticks: {
        maxTicksLimit: narrow ? 4 : 8,
        maxRotation: 0,
        autoSkip: true,
        callback: function (value) {
          var full = this.getLabelForValue(value);
          if (!narrow) { return full; }
          var bits = String(full).split(' ');
          return keep === 'time' ? bits[bits.length - 1] : bits[0];
        }
      }
    };
  }

  // ---- hash rate and difficulty over time -------------------------------
  // Both logarithmic. Within a week these span more than thirtyfold, and on a
  // linear axis the whole of the quiet stretch would sit flat on the floor.
  var netCanvas = document.getElementById('chart-network');
  if (netCanvas) {
    load('/ext/mining/series?days=7', function (rows) {
      new Chart(netCanvas, {
        type: 'line',
        data: {
          labels: rows.map(function (r) { return shortTime(r.t); }),
          datasets: [
            {
              label: T.hashrate || 'Hash rate',
              data: rows.map(function (r) { return r.hashrate; }),
              borderColor: CYAN, backgroundColor: fade(CYAN, 0.12),
              borderWidth: 2, pointRadius: 0, fill: true, tension: 0.25, yAxisID: 'y'
            },
            {
              label: T.difficulty || 'Difficulty',
              data: rows.map(function (r) { return r.difficulty; }),
              borderColor: CORAL, borderWidth: 2, pointRadius: 0,
              fill: false, tension: 0.25, yAxisID: 'y1'
            }
          ]
        },
        options: {
          interaction: {mode: 'index', intersect: false},
          scales: {
            x: xAxis('date'),
            y: {type: 'logarithmic', position: 'left', grid: grid,
                ticks: {callback: function (v) { return rate(v); }}},
            y1: {type: 'logarithmic', position: 'right', grid: {display: false},
                 ticks: {callback: function (v) { return compact(v); }}}
          },
          plugins: {
            legend: {labels: {boxWidth: 12, usePointStyle: true}},
            tooltip: {callbacks: {label: function (c) {
              return c.dataset.yAxisID === 'y'
                ? c.dataset.label + ': ' + rate(c.parsed.y)
                : c.dataset.label + ': ' + compact(c.parsed.y);
            }}}
          }
        }
      });
    }, netCanvas);
  }

  // ---- reward per block --------------------------------------------------
  // Fees get their own axis. Against a 12.5 subsidy they are a rounding error
  // on this chain; on a shared axis the series would be a flat line at zero.
  var rewCanvas = document.getElementById('chart-rewards');
  if (rewCanvas) {
    load('/ext/mining/rewards?hours=24', function (rows) {
      new Chart(rewCanvas, {
        type: 'bar',
        data: {
          labels: rows.map(function (r) { return shortTime(r.t); }),
          datasets: [
            {
              label: (T.reward || 'Reward') + ' (' + (T.symbol || '') + ')',
              data: rows.map(function (r) { return r.reward / 1e8; }),
              backgroundColor: fade(CYAN, 0.55), borderColor: CYAN, borderWidth: 1, yAxisID: 'y'
            },
            {
              label: (T.fees || 'Fees') + ' (' + (T.symbol || '') + ')',
              data: rows.map(function (r) { return r.fees / 1e8; }),
              type: 'line', borderColor: CORAL, borderWidth: 2,
              pointRadius: 0, fill: false, yAxisID: 'y1'
            }
          ]
        },
        options: {
          interaction: {mode: 'index', intersect: false},
          scales: {
            x: xAxis('time'),
            y: {position: 'left', grid: grid, beginAtZero: true},
            y1: {position: 'right', grid: {display: false}, beginAtZero: true,
                 ticks: {callback: function (v) { return v.toFixed(4); }}}
          },
          plugins: {legend: {labels: {boxWidth: 12, usePointStyle: true}}}
        }
      });
    }, rewCanvas);
  }

  // ---- blocks per coinbase address --------------------------------------
  // Horizontal bars, not a pie. The distribution here is one address with most
  // of the blocks and a long tail of single ones -- as a pie that is one wedge
  // and seventy slivers. Everything past the top ten is summed into one row so
  // the tail is present as a quantity without being drawn address by address.
  var minCanvas = document.getElementById('chart-miners');
  if (minCanvas) {
    load('/ext/mining/miners?hours=24', function (rows) {
      var TOP = 10;
      var head = rows.slice(0, TOP);
      var tail = rows.slice(TOP);
      var labels = head.map(function (r) {
        return r.winner ? (r.winner.slice(0, 8) + '…' + r.winner.slice(-4)) : '—';
      });
      var values = head.map(function (r) { return r.blocks; });
      if (tail.length) {
        labels.push((T.rest || 'others') + ' (' + tail.length + ')');
        values.push(tail.reduce(function (a, r) { return a + r.blocks; }, 0));
      }
      new Chart(minCanvas, {
        type: 'bar',
        data: {
          labels: labels,
          datasets: [{
            label: T.blocks || 'Blocks',
            data: values,
            backgroundColor: fade(CORAL, 0.55), borderColor: CORAL, borderWidth: 1
          }]
        },
        options: {
          indexAxis: 'y',
          scales: {
            x: {grid: grid, beginAtZero: true, ticks: {precision: 0}},
            y: {grid: {display: false}}
          },
          plugins: {legend: {display: false}}
        }
      });
    }, minCanvas);
  }

  var SI = ['H/s', 'kH/s', 'MH/s', 'GH/s', 'TH/s', 'PH/s', 'EH/s'];
  function rate(h) {
    var i = 0;
    h = h || 0;
    while (h >= 1000 && i < SI.length - 1) { h /= 1000; i++; }
    return h.toFixed(h < 10 ? 2 : 0) + ' ' + SI[i];
  }
  function compact(n) {
    try { return Number(n).toLocaleString(LOCALE, {notation: 'compact', maximumFractionDigits: 1}); }
    catch (e) { return String(Math.round(n)); }
  }
})();
