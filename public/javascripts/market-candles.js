/**
* The 24-hour candlestick on a market page.
*
* Was jqPlot's OHLCRenderer. Chart.js has no candlestick type, and the plugin
* that adds one would bring a charting extension and a date adapter with it --
* three libraries for two pages that are off by default. It does support
* floating bars natively, though: a bar whose value is [min, max] is drawn
* between them rather than up from zero, which is a candle in two parts.
*
*   the wick   a thin bar from low to high
*   the body   a wider bar from open to close, coloured by direction
*
* Same picture, no new dependency. `chartdata` arrives as rows of
* [timestampMs, open, high, low, close].
*/
(function () {
  'use strict';

  // This one waits for the document. Unlike the other chart pages, the market
  // template puts its scripts at the top of the block -- run straight away and
  // the canvas does not exist yet, so the chart is silently never built. The
  // guard costs nothing where the script is already last.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', draw);
  } else {
    draw();
  }

  function draw() {
  var canvas = document.getElementById('marketChart');
  if (!canvas || typeof Chart === 'undefined') { return; }

  var rows = window.MARKET_OHLC || [];
  var T = window.MARKET_I18N || {};
  if (!rows.length) { return; }

  function css(name, fallback) {
    try {
      var v = getComputedStyle(document.documentElement).getPropertyValue(name);
      return (v && v.trim()) || fallback;
    } catch (e) { return fallback; }
  }

  var UP = css('--ls-up', '#4CAF7D');
  var DOWN = css('--ls-down', '#FF6B5B');
  var TEXT = css('--ls-stardust', '#A8B3C7');
  var GRID = css('--ls-horizon', '#232B3D');

  Chart.defaults.color = TEXT;
  Chart.defaults.font.family = 'Inter, -apple-system, "Segoe UI", Roboto, sans-serif';
  Chart.defaults.maintainAspectRatio = false;

  var LOCALE = T.locale || 'en-GB';
  function clock(ms) {
    return new Date(ms).toLocaleTimeString(LOCALE, {hour: '2-digit', minute: '2-digit'});
  }
  function price(v) { return Number(v).toFixed(8); }

  var colours = rows.map(function (r) { return r[4] >= r[1] ? UP : DOWN; });

  new Chart(canvas, {
    type: 'bar',
    data: {
      labels: rows.map(function (r) { return clock(r[0]); }),
      datasets: [
        {
          label: T.range || 'Low / high',
          data: rows.map(function (r) { return [r[3], r[2]]; }),
          backgroundColor: colours,
          barPercentage: 0.12,
          categoryPercentage: 0.9,
          // The wick sits behind the body, and both are keyed to the same
          // category, so order in this array is what stacks them.
          order: 2
        },
        {
          label: T.body || 'Open / close',
          data: rows.map(function (r) { return [r[1], r[4]]; }),
          backgroundColor: colours,
          barPercentage: 0.62,
          categoryPercentage: 0.9,
          order: 1
        }
      ]
    },
    options: {
      interaction: {mode: 'index', intersect: false},
      scales: {
        x: {grid: {display: false}, ticks: {maxTicksLimit: 12, maxRotation: 0, autoSkip: true}},
        y: {
          grid: {color: GRID},
          // A price series rarely reaches zero, and starting there would press
          // a day of movement into a band at the top.
          beginAtZero: false,
          ticks: {callback: function (v) { return price(v); }}
        }
      },
      plugins: {
        legend: {display: false},
        tooltip: {
          callbacks: {
            title: function (items) { return items.length ? items[0].label : ''; },
            label: function (c) {
              var r = rows[c.dataIndex];
              if (!r) { return ''; }
              // One row says everything about the candle; the second dataset
              // would otherwise repeat half of it.
              if (c.datasetIndex !== 0) { return ''; }
              return [
                (T.open || 'open') + ': ' + price(r[1]),
                (T.high || 'high') + ': ' + price(r[2]),
                (T.low || 'low') + ': ' + price(r[3]),
                (T.close || 'close') + ': ' + price(r[4])
              ];
            }
          }
        }
      }
    }
  });
  }
})();
