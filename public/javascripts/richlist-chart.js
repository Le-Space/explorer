/**
* The wealth distribution doughnut on /richlist.
*
* Was jqPlot; see the note in views/richlist.pug for why it is not any more.
* The slice colours come from the brand custom properties rather than the
* literals the old chart carried, so the palette is defined in one place.
*/
(function () {
  'use strict';

  var canvas = document.getElementById('pieChart');
  if (!canvas || typeof Chart === 'undefined') { return; }

  var rows = window.WEALTH_DIST || [];
  if (!rows.length) { return; }

  function css(name, fallback) {
    try {
      var v = getComputedStyle(document.documentElement).getPropertyValue(name);
      return (v && v.trim()) || fallback;
    } catch (e) { return fallback; }
  }

  var TEXT = css('--ls-stardust', '#A8B3C7');
  var NEBULA = css('--ls-nebula', '#141926');

  // The five band colours are defined in the stylesheet, next to the legend
  // swatches that use the same five. Reading them instead of mixing them here
  // is what keeps the table and the chart from drifting apart -- which is
  // exactly what the old page did, with one set of literals in each.
  var COLOURS = [1, 2, 3, 4, 5].map(function (i) {
    return css('--ls-dist-' + i, '#58C7F3');
  });

  Chart.defaults.color = TEXT;
  Chart.defaults.font.family = 'Inter, -apple-system, "Segoe UI", Roboto, sans-serif';

  new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: rows.map(function (r) { return r.label; }),
      datasets: [{
        data: rows.map(function (r) { return r.value; }),
        backgroundColor: COLOURS,
        // The gap between slices used to be jqPlot's sliceMargin; here it is a
        // border in the card colour, which keeps working on either theme.
        borderColor: NEBULA,
        borderWidth: 2
      }]
    },
    options: {
      maintainAspectRatio: false,
      cutout: '55%',
      plugins: {
        legend: {position: 'bottom', labels: {boxWidth: 12, usePointStyle: true, padding: 12}},
        tooltip: {callbacks: {label: function (c) {
          return c.label + ': ' + Number(c.parsed).toFixed(2) + ' %';
        }}}
      }
    }
  });
})();
