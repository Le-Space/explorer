var express = require('express')
    , router = express.Router()
    , settings = require('../lib/settings')
    , locale = require('../lib/locale')
    , db = require('../lib/database')
    , lib = require('../lib/explorer')
    , names = require('../lib/names')
    , qr = require('qr-image');

// The locale of THIS request. lib/locale is the instance default, loaded once at
// startup; the middleware in app.js puts the visitor's choice on res.locals.
function L(res) {
  return (res.locals && res.locals.settings && res.locals.settings.locale) || locale;
}

function route_get_block(res, blockhash) {
  lib.get_block(blockhash, function (block) {
    if (block != 'There was an error. Check your console.') {
      if (blockhash == settings.genesis_block) {
        res.render('block', { active: 'block', block: block, confirmations: settings.confirmations, txs: 'GENESIS'});
      } else {
        db.get_txs(block, function(txs) {
          if (txs.length > 0) {
            res.render('block', { active: 'block', block: block, confirmations: settings.confirmations, txs: txs});
          } else {
            db.create_txs(block, function(){
              db.get_txs(block, function(ntxs) {
                if (ntxs.length > 0) {
                  res.render('block', { active: 'block', block: block, confirmations: settings.confirmations, txs: ntxs});
                } else {
                  route_get_index(res, 'Block not found: ' + blockhash);
                }
              });
            });
          }
        });
      }
    } else {
      if (!isNaN(blockhash)) {
        var height = blockhash;
        lib.get_blockhash(height, function(hash) {
          if (hash != 'There was an error. Check your console.') {
            res.redirect('/block/' + hash);
          } else {
            route_get_index(res, 'Block not found: ' + blockhash);
          }
        });
      } else {
        route_get_index(res, 'Block not found: ' + blockhash);
      }
    }
  });
}
/* GET functions */

function route_get_tx(res, txid) {
  if (txid == settings.genesis_tx) {
    route_get_block(res, settings.genesis_block);
  } else {
    db.get_tx(txid, function(tx) {
      if (tx) {
        lib.get_blockcount(function(blockcount) {
          res.render('tx', { active: 'tx', tx: tx, confirmations: settings.confirmations, blockcount: blockcount});
        });
      }
      else {
        lib.get_rawtransaction(txid, function(rtx) {
          if (rtx.txid) {
            lib.prepare_vin(rtx, function(vin) {
              lib.prepare_vout(rtx.vout, rtx.txid, vin, function(rvout, rvin) {
                lib.calculate_total(rvout, function(total){
                  if (!rtx.confirmations > 0) {
                    var utx = {
                      txid: rtx.txid,
                      vin: rvin,
                      vout: rvout,
                      total: total.toFixed(8),
                      timestamp: rtx.time,
                      blockhash: '-',
                      blockindex: -1,
                    };
                    res.render('tx', { active: 'tx', tx: utx, confirmations: settings.confirmations, blockcount:-1});
                  } else {
                    var utx = {
                      txid: rtx.txid,
                      vin: rvin,
                      vout: rvout,
                      total: total.toFixed(8),
                      timestamp: rtx.time,
                      blockhash: rtx.blockhash,
                      blockindex: rtx.blockheight,
                    };
                    lib.get_blockcount(function(blockcount) {
                      res.render('tx', { active: 'tx', tx: utx, confirmations: settings.confirmations, blockcount: blockcount});
                    });
                  }
                });
              });
            });
          } else {
            route_get_index(res, null);
          }
        });
      }
    });
  }
}

function route_get_index(res, error) {
  db.is_locked(function(locked) {
    if (locked) {
      res.render('index', { active: 'home', error: error, warning: L(res).initial_index_alert});
    } else {
      res.render('index', { active: 'home', error: error, warning: null});
    }
  });
}

function route_get_address(res, hash, count) {
  db.get_address(hash, function(address) {
    if (address) {
      var txs = [];
      res.render('address', { active: 'address', address: address, txs: txs});
    } else {
      route_get_index(res, hash + ' not found');
    }
  });
}

function route_get_claim_form(res, hash){
  db.get_address(hash, function(address) {
    if (address) {
      res.render("claim_address", { active: "address", address: address});
    } else {
      route_get_index(res, hash + ' not found');
    }
  });
}

/* GET home page. */
router.get('/', function(req, res) {
  route_get_index(res, null);
});

router.get('/info', function(req, res) {
  res.render('info', { active: 'info', address: settings.address, hashes: settings.api });
});

/**
* Imprint and privacy notice.
*
* Served only while an operator is configured. An instance that has not filled
* in settings.legal would otherwise publish an empty imprint, which is worse
* than publishing none -- so it answers 404 and the footer hides the links.
*
* `title` is both the card heading and, via pageTitle, the document title; the
* view picks its structure from `doc`.
*/
function render_legal(res, doc) {
  if (!settings.legal || !settings.legal.company) {
    return res.status(404).render('error', { active: '', error: '404', message: 'Not found' });
  }
  var heading = doc === 'imprint' ? L(res).legal_imprint : L(res).legal_privacy;
  res.render('legal', { active: 'legal', doc: doc, title: heading, pageTitle: heading });
}

router.get('/imprint', function(req, res) {
  render_legal(res, 'imprint');
});

router.get('/privacy', function(req, res) {
  render_legal(res, 'privacy');
});

router.get('/markets/:market', function(req, res) {
  var market = req.params['market'];
  if (settings.markets.enabled.indexOf(market) != -1) {
    db.get_market(market, function(data) {
      /*if (market === 'bittrex') {
        data = JSON.parse(data);
      }*/
      // console.log(data);
      res.render('./markets/' + market, {
        active: 'markets',
        marketdata: {
          coin: settings.markets.coin,
          exchange: settings.markets.exchange,
          data: data,
        },
        market: market
      });
    });
  } else {
    route_get_index(res, null);
  }
});

router.get('/richlist', function(req, res) {
  if (settings.display.richlist == true ) {
    db.get_stats(settings.coin, function (stats) {
      db.get_richlist(settings.coin, function(richlist){
        //console.log(richlist);
        if (richlist) {
          db.get_distribution(richlist, stats, function(distribution) {
            //console.log(distribution);
            res.render('richlist', {
              active: 'richlist',
              balance: richlist.balance,
              received: richlist.received,
              stats: stats,
              dista: distribution.t_1_25,
              distb: distribution.t_26_50,
              distc: distribution.t_51_75,
              distd: distribution.t_76_100,
              diste: distribution.t_101plus,
              show_dist: settings.richlist.distribution,
              show_received: settings.richlist.received,
              show_balance: settings.richlist.balance,
            });
          });
        } else {
          route_get_index(res, null);
        }
      });
    });
  } else {
    route_get_index(res, null);
  }
});

router.get('/movement', function(req, res) {
  res.render('movement', {active: 'movement', flaga: settings.movement.low_flag, flagb: settings.movement.high_flag, min_amount:settings.movement.min_amount});
});

/**
* The mining page.
*
* Headline figures and the recent blocks are rendered here, server-side, so
* the page says something before any JavaScript runs; the three charts fetch
* their series from /ext/mining/* afterwards. An instance with no recorded
* blocks gets a short explanation instead of a page of zeroes -- see
* db.get_mining_page.
*/
router.get('/mining', function(req, res) {
  db.get_mining_page(function(page) {
    res.render('mining', {
      active: 'mining',
      empty: page.empty,
      tiles: page.tiles,
      recent: page.recent,
      pageTitle: L(res).mining_title
    });
  });
});

router.get('/network', function(req, res) {
  res.render('network', {active: 'network'});
});

router.get('/reward', function(req, res){
  //db.get_stats(settings.coin, function (stats) {
    console.log(stats);
    db.get_heavy(settings.coin, function (heavy) {
      //heavy = heavy;
      var votes = heavy.votes;
      votes.sort(function (a,b) {
        if (a.count < b.count) {
          return -1;
        } else if (a.count > b.count) {
          return 1;
        } else {
          return 0;
        }
      });

      res.render('reward', { active: 'reward', stats: stats, heavy: heavy, votes: heavy.votes });
    });
  //});
});

router.get('/tx/:txid', function(req, res) {
  route_get_tx(res, req.params.txid);
});

router.get('/block/:hash', function(req, res) {
  route_get_block(res, req.params.hash);
});

// A name in the URL, the way a transaction or a block has one: /name/<name>.
//
// A wildcard rather than :name, because names carry slashes -- the registration
// test/v31.1.4-canary-20260913 is a single name, and a path parameter stops at
// the first slash. Express decodes the match, so the percent-encoded form
// /name/test%2Fv31.1.4-canary-20260913 arrives as the same string and both
// spellings lead to the same place.
router.get('/name/*', function(req, res) {
  route_get_name(res, req.params[0]);
});

router.get('/address/:hash/claim', function(req,res){
  route_get_claim_form(res, req.params.hash);
});

router.get('/address/:hash', function(req, res) {
  route_get_address(res, req.params.hash, settings.txcount);
});

router.get('/address/:hash/:count', function(req, res) {
  route_get_address(res, req.params.hash, req.params.count);
});

// Last resort of the search: treat the query as a name.
//
// Names are not in the explorer's database, so this asks ElectrumX's name index
// and lands on the transaction that last operated on the name -- which shows the
// name, its value and its block, because the transaction page renders name
// operations. It runs only after block, transaction and address have all missed,
// so a name that looks like a block height keeps its old meaning.
//
// If ElectrumX is unreachable the user sees the ordinary "not found" message:
// a search box is the wrong place to report an infrastructure fault.
// The name page: whether the name is still registered, what it holds, and every
// operation that was ever made on it. Both the search box and /name/<name> come
// through here, so the two cannot drift apart.
//
// It renders rather than redirecting to the transaction: expiry and history are
// properties of the NAME, and a transaction page can only ever show the one
// operation it carries.
// What a shared link to a name should say in Telegram, on X, in LinkedIn: the
// name, whether anyone can still take it, which block it last moved in, and the
// beginning of its value. The words come from the request's locale, so a link
// shared as ?lang=de previews in German.
function name_preview(res, nameinfo, blockcount) {
  var t = L(res);
  var newest = nameinfo.newest;
  var status;
  if (nameinfo.pending) {
    status = t.og_unconfirmed;
  } else if (nameinfo.expires_at && blockcount >= nameinfo.expires_at) {
    status = t.og_expired_since + ' ' + nameinfo.expires_at + ' \u2014 ' + t.og_free_again;
  } else {
    status = t.og_registered_until + ' ' + nameinfo.expires_at;
  }

  var parts = [status];
  if (newest && newest.height > 0) parts.push(t.og_in_block + ' ' + newest.height);
  if (newest && newest.value) {
    var v = String(newest.value).replace(/\s+/g, ' ').trim();
    parts.push(v.length > 110 ? v.slice(0, 110) + '\u2026' : v);
  }

  return {
    title: nameinfo.name + ' \u00b7 ' + (settings.headerlabel || settings.coin),
    description: parts.join(' \u00b7 '),
    path: '/name/' + nameinfo.name.split('/').map(encodeURIComponent).join('/')
  };
}

function route_get_name(res, name) {
  if (!name) return route_get_index(res, L(res).ex_search_error + name);
  names.page(name, function(err, nameinfo) {
    if (err) {
      console.error('name lookup failed for "' + name + '": ' + err.message);
      return route_get_index(res, L(res).ex_search_error + name);
    }
    if (!nameinfo) return route_get_index(res, L(res).ex_search_error + name);
    lib.get_blockcount(function(blockcount) {
      res.render('name', {
        active: 'name',
        nameinfo: nameinfo,
        blockcount: blockcount,
        meta: name_preview(res, nameinfo, blockcount)
      });
    });
  });
}

// A found name gets its own URL in the address bar.
//
// The search is a POST, so rendering the result here would leave the browser on
// /search: the page could not be linked, bookmarked or reloaded, and the share
// button would be the only way to get the address. Redirecting to /name/<name>
// costs one extra lookup and makes the result a real, shareable page.
//
// The redirect uses the RESOLVED name, which can differ from what was typed
// when the match came from the Unicode-normalised form.
function search_name(res, query) {
  names.lookup(query, function(err, hit) {
    if (err) {
      console.error('name lookup failed for "' + query + '": ' + err.message);
      return route_get_index(res, L(res).ex_search_error + query);
    }
    if (!hit) return route_get_index(res, L(res).ex_search_error + query);
    res.redirect('/name/' + hit.name.split('/').map(encodeURIComponent).join('/'));
  });
}

router.post('/search', function(req, res) {
  var query = req.body.search;
  if (query.length == 64) {
    if (query == settings.genesis_tx) {
      res.redirect('/block/' + settings.genesis_block);
    } else {
      db.get_tx(query, function(tx) {
        if (tx) {
          res.redirect('/tx/' +tx.txid);
        } else {
          lib.get_block(query, function(block) {
            if (block != 'There was an error. Check your console.') {
              res.redirect('/block/' + query);
            } else {
              search_name(res, query);
            }
          });
        }
      });
    }
  } else {
    db.get_address(query, function(address) {
      if (address) {
        res.redirect('/address/' + address.a_id);
      } else {
        lib.get_blockhash(query, function(hash) {
          if (hash != 'There was an error. Check your console.') {
            res.redirect('/block/' + hash);
          } else {
            search_name(res, query);
          }
        });
      }
    });
  }
});

router.get('/qr/:string', function(req, res) {
  if (req.params.string) {
    var address = qr.image(req.params.string, {
      type: 'png',
      size: 4,
      margin: 1,
      ec_level: 'M'
    });
    res.type('png');
    address.pipe(res);
  }
});

/**
* Reads a whole-number query parameter within bounds.
*
* The bound is not politeness: these endpoints turn a number into a time range
* and then into a database scan, so an unbounded `days` would walk the whole
* collection on request. Anything missing or unreadable falls back to the
* default rather than erroring -- a chart asking for nonsense should get the
* ordinary view, not a broken page.
*/
function bounded(value, fallback, min, max) {
  var n = parseInt(value, 10);
  if (isNaN(n)) { return fallback; }
  return Math.min(max, Math.max(min, n));
}

// Difficulty and hash rate over time. See db.get_mining_series for why this is
// sampled by block rather than bucketed by hour.
router.get('/ext/mining/series', function(req, res) {
  db.get_mining_series(bounded(req.query.days, 7, 1, 90), function(data) {
    res.send({data: data});
  });
});

// Reward and fees per block.
router.get('/ext/mining/rewards', function(req, res) {
  db.get_mining_rewards(bounded(req.query.hours, 24, 1, 168), function(data) {
    res.send({data: data});
  });
});

// Blocks per coinbase address -- a payout destination, not an operator.
router.get('/ext/mining/miners', function(req, res) {
  db.get_mining_miners(bounded(req.query.hours, 24, 1, 168), function(data) {
    res.send({data: data});
  });
});

router.get('/ext/summary', function(req, res) {
  lib.get_difficulty(function(difficulty) {
    difficultyHybrid = ''
    if (difficulty['proof-of-work']) {
      if (settings.index.difficulty == 'Hybrid') {
        difficultyHybrid = 'POS: ' + difficulty['proof-of-stake'];
        difficulty = 'POW: ' + difficulty['proof-of-work'];
      } else if (settings.index.difficulty == 'POW') {
        difficulty = difficulty['proof-of-work'];
      } else {
        difficulty = difficulty['proof-of-stake'];
      }
    }
    lib.get_hashrate(function(hashrate) {
      lib.get_connectioncount(function(connections){
        lib.get_blockcount(function(blockcount) {
          db.get_stats(settings.coin, function (stats) {
            if (hashrate == 'There was an error. Check your console.') {
              hashrate = 0;
            }
            res.send({ data: [{
              difficulty: difficulty,
              difficultyHybrid: difficultyHybrid,
              supply: stats.supply,
              hashrate: hashrate,
              lastPrice: stats.last_price,
              connections: connections,
              blockcount: blockcount
            }]});
          });
        });
      });
    });
  });
});
module.exports = router;
