/**
* The charts on /mining.
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

  // Units for rate(). Up here with the other constants because the window
  // charts draw while this script is still being run, before the lines further
  // down have assigned anything.
  var SI = ['H/s', 'kH/s', 'MH/s', 'GH/s', 'TH/s', 'PH/s', 'EH/s'];

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

  // `canvas` may be one canvas or several fed by the same request, in which
  // case each of them says so.
  function say(canvas, message) {
    [].concat(canvas).forEach(function (c) {
      var box = c && c.parentNode;
      if (!box) { return; }
      // A chart that got far enough to register itself keeps listeners and a
      // resize observer alive. Replacing the canvas alone leaves all of that
      // running on a node no longer in the document.
      try {
        var live = Chart.getChart && Chart.getChart(c);
        if (live) { live.destroy(); }
      } catch (e) { /* nothing worth reporting to a reader */ }
      var p = document.createElement('p');
      p.className = 'mining-note mining-empty';
      p.textContent = message;
      box.replaceChild(p, c);
    });
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
  // Asked each time a label is drawn rather than once at load: tick callbacks
  // run again on every resize, so a window dragged narrow shortens its labels
  // and one dragged back wide restores them.
  function narrow() { return (window.innerWidth || 1024) < 600; }
  function xAxis(keep) {
    return {
      grid: {display: false},
      ticks: {
        maxTicksLimit: narrow() ? 4 : 8,
        maxRotation: 0,
        autoSkip: true,
        callback: function (value) {
          var full = this.getLabelForValue(value);
          if (!narrow()) { return full; }
          var bits = String(full).split(' ');
          return keep === 'time' ? bits[bits.length - 1] : bits[0];
        }
      }
    };
  }

  // ---- block time and hash rate by window --------------------------------
  // One bar per window, from the last hour to the last year, all ending now.
  //
  // Both value axes start at zero, so the length of a bar is its value. #31
  // asked for logarithmic axes "as with #29", but #29 draws lines, where the
  // axis only places a point; here the bar's length carries the meaning and a
  // log axis cannot give it one. Chart.js makes that concrete: the bar
  // controller forces beginAtZero, and a log scale honours it by dropping the
  // axis minimum to the decade below the data -- so eight windows spanning
  // 45 % drew as bars spanning 26 %, and letting one window fall a decade
  // lengthened seven bars whose values had not moved.
  //
  // A bar resting on fewer than FEW blocks is drawn lighter, since an hour
  // holds a handful and a reader should see how little stands behind it. A
  // window without history, or without a single block, gets no bar. The
  // tooltip and the table say which of the two it is.
  //
  // The rows come with the page (window.MINING_WINDOWS), the very snapshot the
  // table was rendered from.
  var winTimeCanvas = document.getElementById('chart-windows-blocktime');
  var winRateCanvas = document.getElementById('chart-windows-hashrate');
  var winCanvases = [winTimeCanvas, winRateCanvas].filter(Boolean);
  function drawWindows(rows) {
    if (!rows.some(function (r) { return r.blocks > 0; })) {
      return say(winCanvases, T.noHistory || T.noData || 'No data.');
    }
    var FEW = 6;
    var labels = rows.map(function (r) { return (T.windowLabels && T.windowLabels[r.window]) || r.window; });
    function colours(colour) {
      return rows.map(function (r) { return fade(colour, r.blocks < FEW ? 0.25 : 0.6); });
    }
    function status(i) {
      var r = rows[i];
      if (!r.history) { return T.noHistory || 'not enough history'; }
      if (!r.blocks) { return T.noBlock || 'no block'; }
      return (T.blocks || 'Blocks') + ': ' + Number(r.blocks).toLocaleString(LOCALE);
    }
    // Axis ticks round to whole minutes from ten upwards, tooltips keep one
    // decimal, as the table does.
    function minutesTick(v) {
      return Number(v).toLocaleString(LOCALE, {maximumFractionDigits: v < 10 ? 1 : 0}) + ' min';
    }
    function minutesExact(v) {
      return Number(v).toLocaleString(LOCALE, {minimumFractionDigits: 1, maximumFractionDigits: 1}) + ' min';
    }
    // A linear axis is labelled at every tick it draws, so the origin is the
    // only one worth a word: "0.0 min" and "0.00 H/s" are noise.
    function minutesAxisTick(v) { return v ? minutesTick(v) : '0'; }
    // One unit for the whole hash-rate axis, taken from its largest bar.
    // Formatted tick by tick, a scale reading 500 TH/s, 1.00 PH/s, 1.50 PH/s
    // looks like it changes gear halfway up.
    var peak = rows.reduce(function (m, r) { return Math.max(m, r.hashrate || 0); }, 0);
    var unit = 0, div = 1;
    while (peak / div >= 1000 && unit < SI.length - 1) { div *= 1000; unit++; }
    function rateAxisTick(v) {
      if (!v) { return '0'; }
      var n = v / div;
      return n.toLocaleString(LOCALE, {maximumFractionDigits: n < 10 ? 2 : 0}) + ' ' + SI[unit];
    }
    // The legend takes its swatch from the first bar, which is often a light
    // one. It should show the colour a normal bar has.
    function legendOf(colour) {
      return {labels: {boxWidth: 12, usePointStyle: true, generateLabels: function (chart) {
        var items = Chart.defaults.plugins.legend.labels.generateLabels(chart);
        if (items.length) { items[0].fillStyle = fade(colour, 0.6); }
        return items;
      }}};
    }
    // Each chart is built inside its own guard. Sharing one meant that a throw
    // while building the second replaced the first -- which had drawn
    // correctly -- with an apology.
    //
    // Only a bar that has a value gets its block count under the label. For an
    // empty one the label already says why it is empty.
    function countUnder(items) {
      var it = items[0];
      return it && it.parsed.y != null ? status(it.dataIndex) : '';
    }

    if (winTimeCanvas) {
      try {
        var target = T.targetMinutes || 10;
        new Chart(winTimeCanvas, {
          type: 'bar',
          data: {
            labels: labels,
            datasets: [
              {
                label: T.avgBlockTime || 'Average block time',
                data: rows.map(function (r) { return r.avg_block_time == null ? null : r.avg_block_time / 60; }),
                backgroundColor: colours(CYAN), borderColor: CYAN, borderWidth: 1
              },
              {
                type: 'line',
                label: (T.target || 'Target') + ' ' + minutesTick(target),
                data: rows.map(function () { return target; }),
                borderColor: CORAL, borderDash: [6, 4], borderWidth: 1.5,
                pointRadius: 0, pointHoverRadius: 0, pointStyle: 'line', fill: false
              }
            ]
          },
          options: {
            interaction: {mode: 'index', intersect: false},
            scales: {
              // No rotation of our own: Chart.js turns the labels only when they
              // will not fit, and asks again on every resize. Deciding it here
              // from window.innerWidth got it wrong at 1024 px, where these
              // charts are half-width and "6 mo" ended one pixel before
              // "12 mo" began.
              x: {grid: {display: false}, ticks: {autoSkip: false}},
              y: {type: 'linear', min: 0, grid: grid, ticks: {callback: minutesAxisTick}}
            },
            plugins: {
              legend: legendOf(CYAN),
              tooltip: {
                filter: function (it) { return it.datasetIndex === 0; },
                callbacks: {
                  label: function (c) { return c.parsed.y == null ? status(c.dataIndex) : c.dataset.label + ': ' + minutesExact(c.parsed.y); },
                  afterBody: countUnder
                }
              }
            }
          }
        });
      } catch (e) { say(winTimeCanvas, T.noData || 'No data.'); }
    }

    if (winRateCanvas) {
      try {
        new Chart(winRateCanvas, {
          type: 'bar',
          data: {
            labels: labels,
            datasets: [{
              label: T.hashrate || 'Hash rate',
              data: rows.map(function (r) { return r.hashrate; }),
              backgroundColor: colours(CORAL), borderColor: CORAL, borderWidth: 1
            }]
          },
          options: {
            interaction: {mode: 'index', intersect: false},
            scales: {
              x: {grid: {display: false}, ticks: {autoSkip: false}},
              y: {type: 'linear', min: 0, grid: grid, ticks: {callback: rateAxisTick}}
            },
            plugins: {
              legend: {display: false},
              tooltip: {callbacks: {
                label: function (c) { return c.parsed.y == null ? status(c.dataIndex) : c.dataset.label + ': ' + rate(c.parsed.y, 2); },
                afterBody: countUnder
              }}
            }
          }
        });
      } catch (e) { say(winRateCanvas, T.noData || 'No data.'); }
    }
  }
  // A missing snapshot is not fetched a second time. It is missing exactly when
  // the server could not read the windows, and /ext/mining/windows is answered
  // by whichever worker of the cluster picks it up -- possibly one whose cache
  // is healthy. That is how the table could come to say "unavailable" above two
  // charts drawing real bars, the one state this page is built never to reach.
  // The endpoint stays, for readers who want the numbers directly.
  if (winCanvases.length) {
    if (window.MINING_WINDOWS && window.MINING_WINDOWS.length) {
      try { drawWindows(window.MINING_WINDOWS); } catch (e) { say(winCanvases, T.noData || 'No data.'); }
    } else {
      say(winCanvases, T.unavailable || T.noData || 'No data.');
    }
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

  // `digits` fixes the decimals, as a tooltip wants. Without it the axis
  // style applies, two below ten and none above. Formatted for the page's
  // language, like every other number on it.
  function rate(h, digits) {
    var i = 0;
    h = h || 0;
    while (h >= 1000 && i < SI.length - 1) { h /= 1000; i++; }
    var d = digits == null ? (h < 10 ? 2 : 0) : digits;
    return h.toLocaleString(LOCALE, {minimumFractionDigits: d, maximumFractionDigits: d}) + ' ' + SI[i];
  }
  function compact(n) {
    try { return Number(n).toLocaleString(LOCALE, {notation: 'compact', maximumFractionDigits: 1}); }
    catch (e) { return String(Math.round(n)); }
  }
})();
