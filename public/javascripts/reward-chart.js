/**
* The two charts on /reward.
*
* They were the last users of the Chart.js 1.x API -- `new Chart(ctx).Line()`
* and `.Doughnut()`, an interface that was replaced in 2016. See the note in
* views/reward.pug.
*
* Colours come from the brand custom properties; the swatches in the legend
* table beside the chart take the same values from CSS, so the two cannot
* drift apart the way the old hard-coded literals did.
*/
(function () {
  'use strict';

  if (typeof Chart === 'undefined') { return; }
  var D = window.REWARD_DATA;
  if (!D) { return; }

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
  var NEBULA = css('--ls-nebula', '#141926');

  Chart.defaults.color = TEXT;
  Chart.defaults.font.family = 'Inter, -apple-system, "Segoe UI", Roboto, sans-serif';
  Chart.defaults.maintainAspectRatio = false;

  function fade(hex, alpha) {
    if (!/^#[0-9a-f]{6}$/i.test(hex)) { return hex; }
    var a = Math.round(alpha * 255).toString(16);
    return hex + (a.length < 2 ? '0' + a : a);
  }

  // How far through the current cycle the chain is. A doughnut of two slices,
  // which is a gauge -- so it carries no legend and no tooltip, and the figure
  // it stands for is printed under it by the template.
  var cycle = document.getElementById('rewardCycle');
  if (cycle) {
    var done = Math.max(0, Math.min(100, D.cyclePercent || 0));
    new Chart(cycle, {
      type: 'doughnut',
      data: {
        labels: [D.i18n.elapsed || '', ''],
        datasets: [{
          data: [done, 100 - done],
          backgroundColor: [CYAN, GRID],
          borderColor: NEBULA,
          borderWidth: 2
        }]
      },
      options: {
        cutout: '68%',
        plugins: {legend: {display: false}, tooltip: {enabled: false}}
      }
    });
  }

  // Votes and the reward they imply, over the last samples the chain reports.
  var series = document.getElementById('rewardVotes');
  if (series && D.labels && D.labels.length) {
    new Chart(series, {
      type: 'line',
      data: {
        labels: D.labels,
        datasets: [
          {
            label: D.i18n.vote || 'Vote',
            data: D.votes,
            borderColor: CYAN, backgroundColor: fade(CYAN, 0.18),
            borderWidth: 2, pointRadius: 2, fill: true, tension: 0
          },
          {
            label: D.i18n.reward || 'Reward',
            data: D.rewards,
            borderColor: CORAL, borderWidth: 2, pointRadius: 2,
            fill: false, tension: 0
          }
        ]
      },
      options: {
        interaction: {mode: 'index', intersect: false},
        scales: {
          x: {grid: {display: false}, ticks: {maxTicksLimit: 10, maxRotation: 0}},
          // The old chart pinned this to 0..8 in whole steps with
          // scaleOverride. Chart.js picks the range now, which is the right
          // behaviour for a vote that a chain may raise past eight.
          y: {grid: {color: GRID}, beginAtZero: true}
        },
        plugins: {legend: {labels: {boxWidth: 12, usePointStyle: true}}}
      }
    });
  }
})();
