/**
* Fill in the blocks collection for history the index has already walked.
*
* The explorer never recorded blocks, so everything time-based -- hashrate,
* difficulty, rewards, block spacing -- starts empty even on a fully synced
* instance. Ordinary syncing records a block from here on; this script covers
* what came before, without touching transactions or addresses.
*
*   node scripts/backfill-blocks.js days 30      the last 30 days
*   node scripts/backfill-blocks.js blocks 5000  the last 5000 blocks
*   node scripts/backfill-blocks.js range 1 1000 an explicit height range
*
*   --force      rewrite heights that already have a document
*   --timeout N  milliseconds between blocks (default: settings.update_timeout)
*
* It is safe to interrupt and repeat: heights already written are skipped
* unless --force is given. It takes the same db_index lock the indexer takes,
* so it will not run while a sync is in progress.
*/
var mongoose = require('mongoose')
  , db = require('../lib/database')
  , lib = require('../lib/explorer')
  , Block = require('../models/block')
  , settings = require('../lib/settings')
  , fs = require('fs');

function usage() {
  console.log('Usage: node scripts/backfill-blocks.js <days N | blocks N | range FROM TO> [--force] [--timeout MS]');
  console.log('');
  console.log('  days N       cover roughly the last N days, at the chain\'s target spacing');
  console.log('  blocks N     cover the last N blocks');
  console.log('  range A B    cover heights A to B inclusive');
  console.log('');
  console.log('  --force      rewrite heights that already have a document');
  console.log('  --timeout MS pause between blocks (default settings.update_timeout)');
  process.exit(0);
}

var argv = process.argv.slice(2);
var force = argv.indexOf('--force') !== -1;
var timeout = settings.update_timeout;
var t_at = argv.indexOf('--timeout');
if (t_at !== -1 && argv[t_at + 1]) { timeout = parseInt(argv[t_at + 1], 10); }
if (isNaN(timeout) || timeout < 0) { timeout = settings.update_timeout; }
var positional = argv.filter(function(a, i) {
  return a.indexOf('--') !== 0 && !(t_at !== -1 && i === t_at + 1);
});
if (!positional.length) { usage(); }

var mode = positional[0];
var a = parseInt(positional[1], 10);
var b = parseInt(positional[2], 10);
if (mode !== 'days' && mode !== 'blocks' && mode !== 'range') { usage(); }
if (mode === 'range' ? (isNaN(a) || isNaN(b)) : isNaN(a)) { usage(); }

// The indexer's lock, so the two cannot walk the same heights at once.
var lockfile = 'tmp/db_index.pid';

function create_lock(cb) {
  fs.appendFile(lockfile, process.pid.toString(), function (err) {
    if (err) {
      console.log('Error: unable to create %s', lockfile);
      process.exit(1);
    }
    return cb();
  });
}

function remove_lock(cb) {
  fs.unlink(lockfile, function (err) {
    if (err) { console.log('unable to remove %s', lockfile); }
    return cb();
  });
}

function exit(code) {
  mongoose.disconnect();
  process.exit(code || 0);
}

var dbString = 'mongodb://' + settings.dbsettings.user;
dbString = dbString + ':' + settings.dbsettings.password;
dbString = dbString + '@' + settings.dbsettings.address;
dbString = dbString + ':' + settings.dbsettings.port;
dbString = dbString + '/' + settings.dbsettings.database;

fs.exists(lockfile, function (exists) {
  if (exists) {
    console.log('index lock exists -- a sync is running, or a previous one was killed');
    process.exit(1);
  }
  create_lock(function () {
    mongoose.connect(dbString, function (err) {
      if (err) {
        console.log('Unable to connect to database: %s', dbString.replace(/\/\/[^@]*@/, '//***@'));
        return remove_lock(function () { exit(1); });
      }
      lib.get_blockcount(function (tip) {
        if (!tip) {
          console.log('could not read the block count from the daemon');
          return remove_lock(function () { exit(1); });
        }
        var from, to;
        if (mode === 'range') {
          from = a; to = Math.min(b, tip);
        } else {
          // "days" is an estimate: the chain aims at one block every
          // settings.blocktime seconds, and real spacing scatters around it.
          var span = (mode === 'days') ? Math.round(a * 86400 / (settings.blocktime || 600)) : a;
          to = tip;
          from = Math.max(1, tip - span + 1);
        }
        if (from > to) {
          console.log('nothing to do (from %s, to %s)', from, to);
          return remove_lock(function () { exit(0); });
        }
        console.log('tip %s -- writing blocks %s..%s (%s heights)%s', tip, from, to, to - from + 1, force ? ', forced' : '');
        var started = Date.now();
        db.update_block_db(from, to, timeout, force, function (r) {
          var secs = Math.round((Date.now() - started) / 1000);
          console.log('done in %ss: %s written, %s already present, %s unreadable', secs, r.written, r.skipped, r.missing);
          Block.countDocuments({}, function (e, n) {
            if (!e) { console.log('blocks collection now holds %s documents', n); }
            remove_lock(function () { exit(0); });
          });
        });
      });
    });
  });
});
