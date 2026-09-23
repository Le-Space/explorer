var mongoose = require('mongoose')
  , Stats = require('../models/stats')
  , Markets = require('../models/markets')
  , Address = require('../models/address')
  , AddressTx = require('../models/addresstx')
  , Tx = require('../models/tx')
  , Block = require('../models/block')
  , Richlist = require('../models/richlist')
  , Peers = require('../models/peers')
  , Heavy = require('../models/heavy')
  , lib = require('./explorer')
  , settings = require('./settings')
  , fs = require('fs')
  , async = require('async');

mongoose.set('useCreateIndex', true);
mongoose.set('useUnifiedTopology', true);
mongoose.set('useNewUrlParser', true);
mongoose.set('useFindAndModify', false);

function find_address(hash, cb) {
  Address.findOne({a_id: hash}, function(err, address) {
    if(address) {
      return cb(address);
    } else {
      return cb();
    }
  });
}

function find_address_tx(address, hash, cb) {
  AddressTx.findOne({a_id: address, txid: hash}, function(err, address_tx) {
    if(address_tx) {
      return cb(address_tx);
    } else {
      return cb();
    }
  });
}

function find_richlist(coin, cb) {
  Richlist.findOne({coin: coin}, function(err, richlist) {
    if(richlist) {
      return cb(richlist);
    } else {
      return cb();
    }
  });
}

function update_address(hash, blockheight, txid, amount, type, cb) {
  var to_sent = false;
  var to_received = false;
  var addr_inc = {}
  if ( hash == 'coinbase' ) {
    addr_inc.sent = amount;
  } else {
    if (type == 'vin') {
      addr_inc.sent = amount;
      addr_inc.balance = -amount;
    } else {
      addr_inc.received = amount;
      addr_inc.balance = amount;
    }
  }
  Address.findOneAndUpdate({a_id: hash}, {
    $inc: addr_inc
  }, {
    new: true,
    upsert: true
  }, function (err, address) {
    if (err) {
      return cb(err);
    } else {
      if ( hash != 'coinbase' ) {
        AddressTx.findOneAndUpdate({a_id: hash, txid: txid}, {
          $inc: {
            amount: addr_inc.balance
          },
          $set: {
            a_id: hash,
            blockindex: blockheight,
            txid: txid
          }
        }, {
          new: true,
          upsert: true
        }, function (err,addresstx) {
          if (err) {
            return cb(err);
          } else {
            return cb();
          }
        });
      } else {
        return cb();
      }
    }
  });
}


function find_tx(txid, cb) {
  Tx.findOne({txid: txid}, function(err, tx) {
    if(tx) {
      return cb(tx);
    } else {
      return cb(null);
    }
  });
}

/**
* Record one block, from the RPC block object the caller already holds.
*
* Height, hash, time, difficulty, chainwork, size and tx count come straight
* off that object. Reward, fees and winner are read back from the transactions
* of this height instead of asking the daemon again: save_tx has already
* resolved every input's value, so what is left here is arithmetic.
*
* Two details worth knowing before changing the sums. prepare_vin gives a
* coinbase a synthetic input -- {addresses: 'coinbase', amount: <the output>} --
* so a coinbase nets to zero and has to be recognised and taken out rather than
* summed with the rest. And a transaction whose inputs the index could not
* resolve shows more out than in; that is missing data, not a negative fee, so
* it is skipped instead of subtracted.
*/
function save_block(block, cb) {
  if (!block || block.height === undefined || block.height === null) {
    return cb();
  }
  Tx.find({blockindex: block.height}, function(err, txs) {
    if (err) {
      console.log('block %s: %s', block.height, err);
      return cb();
    }
    var sums = lib.summarize_block_txs(txs);
    Block.updateOne({height: block.height}, {
      height: block.height,
      hash: block.hash,
      time: block.time,
      difficulty: parseFloat(block.difficulty) || 0,
      chainwork: block.chainwork || '',
      size: block.size || 0,
      txcount: (block.nTx !== undefined ? block.nTx : (block.tx ? block.tx.length : 0)),
      reward: sums.reward,
      fees: sums.fees,
      winner: sums.winner,
    }, {upsert: true}, function(err2) {
      if (err2) { console.log('block %s: %s', block.height, err2); }
      return cb();
    });
  });
}

function save_tx(txid, blockheight, cb) {
  //var s_timer = new Date().getTime();
  lib.get_rawtransaction(txid, function(tx){
    if (tx != 'There was an error. Check your console.') {
      lib.prepare_vin(tx, function(vin) {
        lib.prepare_vout(tx.vout, txid, vin, function(vout, nvin) {
          lib.syncLoop(vin.length, function (loop) {
            var i = loop.iteration();
            update_address(nvin[i].addresses, blockheight, txid, nvin[i].amount, 'vin', function(){
              loop.next();
            });
          }, function(){
            lib.syncLoop(vout.length, function (subloop) {
              var t = subloop.iteration();
              if (vout[t].addresses) {
                update_address(vout[t].addresses, blockheight, txid, vout[t].amount, 'vout', function(){
                  subloop.next();
                });
              } else {
                subloop.next();
              }
            }, function(){
              lib.calculate_total(vout, function(total){
                var newTx = new Tx({
                  txid: tx.txid,
                  vin: nvin,
                  vout: vout,
                  total: total.toFixed(8),
                  timestamp: tx.time,
                  blockhash: tx.blockhash,
                  blockindex: blockheight,
                });
                newTx.save(function(err) {
                  if (err) {
                    return cb(err);
                  } else {
                    //console.log('txid: ');
                    return cb();
                  }
                });
              });
            });
          });
        });
      });
    } else {
      return cb('tx not found: ' + txid);
    }
  });
}

function get_market_data(market, cb) {
  if(fs.existsSync('./lib/markets/' + market + '.js')){
    exMarket = require('./markets/' + market);
    exMarket.get_data(settings.markets, function(err, obj){
      return cb(err, obj);
    });
  }else{
    return cb(null);
  }
}

function create_lock(lockfile, cb) {
  if (settings.lock_during_index == true) {
    var fname = './tmp/' + lockfile + '.pid';
    fs.appendFile(fname, process.pid.toString(), function (err) {
      if (err) {
        console.log("Error: unable to create %s", fname);
        process.exit(1);
      } else {
        return cb();
      }
    });
  } else {
    return cb();
  }
}

function remove_lock(lockfile, cb) {
  if (settings.lock_during_index == true) {
    var fname = './tmp/' + lockfile + '.pid';
    fs.unlink(fname, function (err){
      if(err) {
        console.log("unable to remove lock: %s", fname);
        process.exit(1);
      } else {
        return cb();
      }
    });
  } else {
    return cb();
  }
}

function is_locked(lockfile, cb) {
  if (settings.lock_during_index == true) {
    var fname = './tmp/' + lockfile + '.pid';
    fs.exists(fname, function (exists){
      if(exists) {
        return cb(true);
      } else {
        return cb(false);
      }
    });
  } else {
    return cb(false);
  }
}

module.exports = {
  // initialize DB
  connect: function(database, cb) {
    mongoose.connect(database, function(err) {
      if (err) {
        console.log('Unable to connect to database: %s', database);
        console.log('Aborting');
        process.exit(1);

      }
      //console.log('Successfully connected to MongoDB');
      return cb();
    });
  },

  is_locked: function(cb) {
    is_locked("db_index", function (exists) {
      if (exists) {
        return cb(true);
      } else {
        return cb(false);
      }
    });
  },

  update_label: function(hash, message, cb){
    find_address(hash, function(address){
      if(address){
        Address.updateOne({a_id:hash}, {
          name: message,
        }, function(){
          return cb();
        })
      }
    })
  },

  check_stats: function(coin, cb) {
    Stats.findOne({coin: coin}, function(err, stats) {
      if(stats) {
        return cb(true);
      } else {
        return cb(false);
      }
    });
  },

  get_stats: function(coin, cb) {
    Stats.findOne({coin: coin}, function(err, stats) {
      if(stats) {
        return cb(stats);
      } else {
        return cb(null);
      }
    });
  },

  create_stats: function(coin, cb) {
    var newStats = new Stats({
      coin: coin,
      last: 0,
    });

    newStats.save(function(err) {
      if (err) {
        console.log(err);
        return cb();
      } else {
        console.log("initial stats entry created for %s", coin);
        //console.log(newStats);
        return cb();
      }
    });
  },

  get_address: function(hash, cb) {
    find_address(hash, function(address){
      return cb(address);
    });
  },

  get_richlist: function(coin, cb) {
    find_richlist(coin, function(richlist){
      return cb(richlist);
    });
  },
  //property: 'received' or 'balance'
  update_richlist: function(list, cb){
    if(list == 'received') {
      Address.find({}, 'a_id balance received name').sort({received: 'desc'}).limit(100).exec(function(err, addresses){
        Richlist.updateOne({coin: settings.coin}, {
          received: addresses,
        }, function() {
          return cb();
        });
      });
    } else { //balance
      Address.find({}, 'a_id balance received name').sort({balance: 'desc'}).limit(100).exec(function(err, addresses){
        Richlist.updateOne({coin: settings.coin}, {
          balance: addresses,
        }, function() {
          return cb();
        });
      });
    }
  },

  get_tx: function(txid, cb) {
    find_tx(txid, function(tx){
      return cb(tx);
    });
  },

  get_txs: function(block, cb) {
    var txs = [];
    lib.syncLoop(block.tx.length, function (loop) {
      var i = loop.iteration();
      find_tx(block.tx[i], function(tx){
        if (tx) {
          txs.push(tx);
          loop.next();
        } else {
          loop.next();
        }
      })
    }, function(){
      return cb(txs);
    });
  },

  create_txs: function(block, cb) {
    is_locked("db_index", function (exists) {
      if (exists) {
        console.log("db_index lock file exists...");
        return cb();
      } else {
        lib.syncLoop(block.tx.length, function (loop) {
          var i = loop.iteration();
          save_tx(block.tx[i], block.height, function(err){
            if (err) {
              loop.next();
            } else {
              //console.log('tx stored: %s', block.tx[i]);
              loop.next();
            }
          });
        }, function(){
          return cb();
        });
      }
    });
  },

  get_last_txs_ajax: function(start, length, min, cb) {
    Tx.find({'total': {$gte: min}}).count(function(err, count){
      Tx.find({'total': {$gte: min}}).sort({blockindex: -1}).skip(Number(start)).limit(Number(length)).exec(function(err, txs){
        if (err) {
          return cb(err);
        } else {
          return cb(txs, count);
        }
      });
    });
  },

  get_address_txs_ajax: function(hash, start, length, cb) {
    var totalCount = 0;
    AddressTx.find({a_id: hash}).count(function(err, count){
      if(err) {
        return cb(err);
      } else {
        totalCount = count;
        AddressTx.aggregate([
          { $match: { a_id: hash } },
          { $sort: {blockindex: -1} },
          { $skip: Number(start) },
          {
            $group: {
              _id: '',
              balance: { $sum: '$amount' }
            }
          },
          {
            $project: {
              _id: 0,
              balance: '$balance'
            }
          },
          { $sort: {blockindex: -1} }
        ], function (err,balance_sum) {
          if (err) {
            return cb(err);
          } else {
            AddressTx.find({a_id: hash}).sort({blockindex: -1}).skip(Number(start)).limit(Number(length)).exec(function (err, address_tx) {
              if (err) {
                return cb(err);
              } else {
                var txs = [];
                var count = address_tx.length;
                var running_balance = balance_sum.length > 0 ? balance_sum[0].balance : 0;

                var txs = [];

                lib.syncLoop(count, function (loop) {
                  var i = loop.iteration();
                  find_tx(address_tx[i].txid, function (tx) {
                    if (tx && !txs.includes(tx)) {
                      tx.balance = running_balance;
                      txs.push(tx);
                      loop.next();
                    } else if (!txs.includes(tx)) {
                      txs.push("1. Not found");
                      loop.next();
                    } else {
                      loop.next();
                    }
                    running_balance = running_balance - address_tx[i].amount;
                  })
                }, function () {
                  return cb(txs, totalCount);
                });
              }
            });
          }
        });
      }
    });
  },

  create_market: function(coin, exchange, market, cb) {
    var newMarkets = new Markets({
      market: market,
      coin: coin,
      exchange: exchange,
    });

    newMarkets.save(function(err) {
      if (err) {
        console.log(err);
        return cb();
      } else {
        console.log("initial markets entry created for %s", market);
        //console.log(newMarkets);
        return cb();
      }
    });
  },

  // checks market data exists for given market
  check_market: function(market, cb) {
    Markets.findOne({market: market}, function(err, exists) {
      if(exists) {
        return cb(market, true);
      } else {
        return cb(market, false);
      }
    });
  },

  // gets market data for given market
  get_market: function(market, cb) {
    Markets.findOne({market: market}, function(err, data) {
      if(data) {
        return cb(data);
      } else {
        return cb(null);
      }
    });
  },

  // creates initial richlist entry in database; called on first launch of explorer
  create_richlist: function(coin, cb) {
    var newRichlist = new Richlist({
      coin: coin,
    });
    newRichlist.save(function(err) {
      if (err) {
        console.log(err);
        return cb();
      } else {
        console.log("initial richlist entry created for %s", coin);
        //console.log(newRichlist);
        return cb();
      }
    });
  },

  // drops richlist data for given coin
  delete_richlist: function(coin, cb) {
    Richlist.findOneAndRemove({coin: coin}, function(err, exists) {
      if(exists) {
        return cb(true);
      } else {
        return cb(false);
      }
    });
  },
  // checks richlist data exists for given coin
  check_richlist: function(coin, cb) {
    Richlist.findOne({coin: coin}, function(err, exists) {
      if(exists) {
        return cb(true);
      } else {
        return cb(false);
      }
    });
  },

  create_heavy: function(coin, cb) {
    var newHeavy = new Heavy({
      coin: coin,
    });
    newHeavy.save(function(err) {
      if (err) {
        console.log(err);
        return cb();
      } else {
        console.log("initial heavy entry created for %s", coin);
        console.log(newHeavy);
        return cb();
      }
    });
  },

  check_heavy: function(coin, cb) {
    Heavy.findOne({coin: coin}, function(err, exists) {
      if(exists) {
        return cb(true);
      } else {
        return cb(false);
      }
    });
  },

  get_heavy: function(coin, cb) {
    Heavy.findOne({coin: coin}, function(err, heavy) {
      if(heavy) {
        return cb(heavy);
      } else {
        return cb(null);
      }
    });
  },
  get_distribution: function(richlist, stats, cb){
    var distribution = {
      supply: stats.supply,
      t_1_25: {percent: 0, total: 0 },
      t_26_50: {percent: 0, total: 0 },
      t_51_75: {percent: 0, total: 0 },
      t_76_100: {percent: 0, total: 0 },
      t_101plus: {percent: 0, total: 0 }
    };
    lib.syncLoop(richlist.balance.length, function (loop) {
      var i = loop.iteration();
      var count = i + 1;
      var percentage = ((richlist.balance[i].balance / 100000000) / stats.supply) * 100;
      if (count <= 25 ) {
        distribution.t_1_25.percent = distribution.t_1_25.percent + percentage;
        distribution.t_1_25.total = distribution.t_1_25.total + (richlist.balance[i].balance / 100000000);
      }
      if (count <= 50 && count > 25) {
        distribution.t_26_50.percent = distribution.t_26_50.percent + percentage;
        distribution.t_26_50.total = distribution.t_26_50.total + (richlist.balance[i].balance / 100000000);
      }
      if (count <= 75 && count > 50) {
        distribution.t_51_75.percent = distribution.t_51_75.percent + percentage;
        distribution.t_51_75.total = distribution.t_51_75.total + (richlist.balance[i].balance / 100000000);
      }
      if (count <= 100 && count > 75) {
        distribution.t_76_100.percent = distribution.t_76_100.percent + percentage;
        distribution.t_76_100.total = distribution.t_76_100.total + (richlist.balance[i].balance / 100000000);
      }
      loop.next();
    }, function(){
      distribution.t_101plus.percent = parseFloat(100 - distribution.t_76_100.percent - distribution.t_51_75.percent - distribution.t_26_50.percent - distribution.t_1_25.percent).toFixed(2);
      distribution.t_101plus.total = parseFloat(distribution.supply - distribution.t_76_100.total - distribution.t_51_75.total - distribution.t_26_50.total - distribution.t_1_25.total).toFixed(8);
      distribution.t_1_25.percent = parseFloat(distribution.t_1_25.percent).toFixed(2);
      distribution.t_1_25.total = parseFloat(distribution.t_1_25.total).toFixed(8);
      distribution.t_26_50.percent = parseFloat(distribution.t_26_50.percent).toFixed(2);
      distribution.t_26_50.total = parseFloat(distribution.t_26_50.total).toFixed(8);
      distribution.t_51_75.percent = parseFloat(distribution.t_51_75.percent).toFixed(2);
      distribution.t_51_75.total = parseFloat(distribution.t_51_75.total).toFixed(8);
      distribution.t_76_100.percent = parseFloat(distribution.t_76_100.percent).toFixed(2);
      distribution.t_76_100.total = parseFloat(distribution.t_76_100.total).toFixed(8);
      return cb(distribution);
    });
  },
  // updates heavy stats for coin
  // height: current block height, count: amount of votes to store
  update_heavy: function(coin, height, count, cb) {
    var newVotes = [];
    lib.get_maxmoney( function (maxmoney) {
      lib.get_maxvote( function (maxvote) {
        lib.get_vote( function (vote) {
          lib.get_phase( function (phase) {
            lib.get_reward( function (reward) {
              lib.get_supply( function (supply) {
                lib.get_estnext( function (estnext) {
                  lib.get_nextin( function (nextin) {
                    lib.syncLoop(count, function (loop) {
                      var i = loop.iteration();
                      lib.get_blockhash(height-i, function (hash) {
                        lib.get_block(hash, function (block) {
                          newVotes.push({count:height-i,reward:block.reward,vote:block.vote});
                          loop.next();
                        });
                      });
                    }, function(){
                      console.log(newVotes);
                      Heavy.updateOne({coin: coin}, {
                        lvote: vote,
                        reward: reward,
                        supply: supply,
                        cap: maxmoney,
                        estnext: estnext,
                        phase: phase,
                        maxvote: maxvote,
                        nextin: nextin,
                        votes: newVotes,
                      }, function() {
                        //console.log('address updated: %s', hash);
                        return cb();
                      });
                    });
                  });
                });
              });
            });
          });
        });
      });
    });
  },

  // updates market data for given market; called by sync.js
  update_markets_db: function(market, cb) {
    get_market_data(market, function (err, obj) {
      if (err == null) {
        Markets.updateOne({market:market}, {
          chartdata: JSON.stringify(obj.chartdata),
          buys: obj.buys,
          sells: obj.sells,
          history: obj.trades,
          summary: obj.stats,
        }, function() {
          if ( market == settings.markets.default ) {
            Stats.updateOne({coin:settings.coin}, {
              last_price: obj.stats.last,
            }, function(){
              return cb(null);
            });
          } else {
            return cb(null);
          }
        });
      } else {
        return cb(err);
      }
    });
  },

  // updates stats data for given coin; called by sync.js
  update_db: function(coin, cb) {
    lib.get_blockcount( function (count) {
      if (!count){
        console.log('Unable to connect to explorer API');
        return cb(false);
      }
      lib.get_supply( function (supply){
        lib.get_connectioncount(function (connections) {
          Stats.findOneAndUpdate({coin: coin}, {
            $set: {
              coin: coin,
              count : count,
              supply: supply,
              connections: connections
            }
          }, {
            new: true
          }, function(err, new_stats) {
            if(err) {
              console.log("Error during Stats Update:", err);
            }
            return cb({coin: coin,
              count : count,
              supply: supply,
              connections: connections,
              last: (new_stats.last ? new_stats.last : 0)});
          });
        });
      });
    });
  },

  // updates tx, address & richlist db's; called by sync.js
  /**
  * Everything the mining page needs before any chart is drawn: the headline
  * figures and the most recent blocks.
  *
  * Rendered server-side on purpose. The charts fetch their series afterwards,
  * but the numbers a reader actually came for are in the HTML, so the page
  * says something before a single byte of JavaScript has run -- and keeps
  * saying it if the charts never load.
  *
  * The figures come from our own rows rather than from RPC, so a tile and the
  * chart beneath it cannot disagree about the same moment.
  *
  * `empty` is its own answer rather than a page of zeroes: an instance that has
  * not backfilled has no history, which is a different thing from a chain that
  * mined nothing, and the view says so.
  */
  get_mining_page: function(cb) {
    var LOOKUP = 120;
    var day_ago = Math.floor(Date.now() / 1000) - 86400;
    Block.find({}, {_id: 0}).sort({height: -1}).limit(LOOKUP + 1).lean().exec(function(err, latest) {
      if (err || !latest || !latest.length) { return cb({empty: true, tiles: {}, recent: []}); }
      var window_asc = latest.slice().reverse();
      var tip = latest[0];
      Block.find({time: {$gte: day_ago}}, {reward: 1, fees: 1, winner: 1, _id: 0})
        .lean().exec(function(err2, day) {
          day = day || [];
          var reward_sum = 0, fees_sum = 0, seen = {}, addresses = 0;
          day.forEach(function(b) {
            reward_sum += (b.reward || 0);
            fees_sum += (b.fees || 0);
            var w = b.winner || '';
            if (!seen[w]) { seen[w] = true; addresses++; }
          });
          return cb({
            empty: false,
            tiles: {
              height: tip.height,
              time: tip.time,
              last_reward: tip.reward,
              last_fees: tip.fees,
              difficulty: tip.difficulty,
              hashrate: lib.hashrate_from_blocks(window_asc),
              blocks_24h: day.length,
              avg_reward_24h: day.length ? Math.round(reward_sum / day.length) : 0,
              fees_24h: fees_sum,
              addresses_24h: addresses
            },
            recent: latest.slice(0, 25)
          });
        });
    });
  },

  /**
  * Difficulty and hash rate over the last `days`, as a series a chart can draw.
  *
  * Sampled rather than bucketed by time. A time bucket has to decide what to do
  * with the hours in which no block was found, and on a chain that aims at ten
  * minutes there are plenty; sampling at evenly spaced *blocks* has no empty
  * buckets to invent a value for. Roughly SAMPLES points come back whatever the
  * range, so a week and a quarter cost the browser the same.
  *
  * At each sample the hash rate is taken over the preceding LOOKUP blocks --
  * the same window getnetworkhashps uses by default, so a point on the chart
  * and the number in the header mean the same thing.
  */
  get_mining_series: function(days, cb) {
    var SAMPLES = 160, LOOKUP = 120;
    var since = Math.floor(Date.now() / 1000) - (days * 86400);
    // Fetch a run-up as well, so the first point on the chart has a full
    // lookback behind it. Without it that point is computed from one block,
    // which is no timespan and therefore zero -- and a chart that opens with a
    // drop to zero reads as an outage that did not happen.
    var runup = LOOKUP * 2 * (settings.blocktime || 600);
    Block.find({time: {$gte: since - runup}}, {height: 1, time: 1, difficulty: 1, chainwork: 1, _id: 0})
      .sort({height: 1}).lean().exec(function(err, blocks) {
        if (err || !blocks || !blocks.length) { return cb([]); }
        // Where the range the caller asked for begins within what we fetched.
        var start = 0;
        while (start < blocks.length && blocks[start].time < since) { start++; }
        // If the run-up did not exist -- a young chain, or a backfill that does
        // not reach back this far -- draw from what there is rather than
        // nothing, and let the first points carry the shorter window.
        if (start >= blocks.length) { start = 0; }
        var visible = blocks.length - start;
        var step = Math.max(1, Math.floor(visible / SAMPLES));
        var out = [];
        for (var i = start; i < blocks.length; i += step) {
          var b = blocks[i];
          out.push({
            t: b.time,
            height: b.height,
            difficulty: b.difficulty,
            hashrate: lib.hashrate_from_blocks(blocks.slice(Math.max(0, i - LOOKUP), i + 1))
          });
        }
        // The newest block is the one a reader checks against the header, so it
        // is always the last point even when the step does not land on it.
        var last = blocks[blocks.length - 1];
        if (!out.length || out[out.length - 1].height !== last.height) {
          out.push({
            t: last.time,
            height: last.height,
            difficulty: last.difficulty,
            hashrate: lib.hashrate_from_blocks(blocks.slice(Math.max(0, blocks.length - 1 - LOOKUP)))
          });
        }
        return cb(out);
      });
  },

  /**
  * Reward and fees per block over the last `hours`. Returned per block rather
  * than aggregated: at ten-minute spacing a day is some 144 rows, and the
  * point of the chart is the spread between blocks, which a mean would hide.
  */
  get_mining_rewards: function(hours, cb) {
    var since = Math.floor(Date.now() / 1000) - (hours * 3600);
    Block.find({time: {$gte: since}}, {height: 1, time: 1, reward: 1, fees: 1, _id: 0})
      .sort({height: 1}).lean().exec(function(err, blocks) {
        if (err || !blocks) { return cb([]); }
        return cb(blocks.map(function(b) {
          return {t: b.time, height: b.height, reward: b.reward, fees: b.fees};
        }));
      });
  },

  /**
  * Blocks and reward per coinbase address over the last `hours`, most blocks
  * first.
  *
  * Deliberately keyed by address and not by "miner": the coinbase output is a
  * payout destination. One operator can use many addresses and a pool pays out
  * to many, so the count is of addresses that were paid, which is what we can
  * actually see. Whatever draws this has to stay readable when the answer is
  * one row -- on a chain with a single active miner, it often is.
  */
  get_mining_miners: function(hours, cb) {
    var since = Math.floor(Date.now() / 1000) - (hours * 3600);
    Block.find({time: {$gte: since}}, {winner: 1, reward: 1, fees: 1, _id: 0})
      .lean().exec(function(err, blocks) {
        if (err || !blocks) { return cb([]); }
        var by = {};
        blocks.forEach(function(b) {
          var key = b.winner || '';
          if (!by[key]) { by[key] = {winner: key, blocks: 0, reward: 0, fees: 0}; }
          by[key].blocks += 1;
          by[key].reward += (b.reward || 0);
          by[key].fees += (b.fees || 0);
        });
        var out = Object.keys(by).map(function(k) { return by[k]; });
        out.sort(function(a, b) { return b.blocks - a.blocks || b.reward - a.reward; });
        return cb(out);
      });
  },

  /**
  * Write block documents for a range of heights the index has already walked.
  *
  * Two RPC calls per block -- the hash, then the block -- plus one read of the
  * transactions already stored for that height. No transaction is fetched
  * again, which is what makes filling in months of history affordable where a
  * reindex would not be.
  *
  * Heights that already have a document are skipped, so an interrupted run is
  * simply repeated. `force` rewrites them instead, for when the fields change.
  */
  update_block_db: function(start, end, timeout, force, cb) {
    if (start < 1) { start = 1; }
    var heights = [];
    for (var h = start; h < (end + 1); h++) { heights.push(h); }
    var task_limit = settings.block_parallel_tasks;
    if (task_limit < 1) { task_limit = 1; }
    var written = 0, skipped = 0, missing = 0;

    async.eachLimit(heights, task_limit, function(height, next_block) {
      var step = function() {
        lib.get_blockhash(height, function(blockhash) {
          if (!blockhash) {
            missing++;
            return setTimeout(next_block, timeout);
          }
          lib.get_block(blockhash, function(block) {
            if (!block || block === 'There was an error. Check your console.') {
              missing++;
              return setTimeout(next_block, timeout);
            }
            save_block(block, function() {
              written++;
              if (written % 250 === 0) {
                console.log('%s blocks written (at height %s)', written, height);
              }
              block = null;
              setTimeout(next_block, timeout);
            });
          });
        });
      };
      if (force) { return step(); }
      Block.findOne({height: height}, function(err, existing) {
        if (existing) { skipped++; return next_block(); }
        step();
      });
    }, function() {
      return cb({written: written, skipped: skipped, missing: missing});
    });
  },

  update_tx_db: function(coin, start, end, timeout, cb) {
    is_locked("db_index", function (exists) {
      if (exists) {
        console.log("db_index lock file exists...");
        return cb();
      } else {
        create_lock("db_index", function (){
          if (start < 1) { start = 1; }
          var complete = false;
          var blocks_to_scan = [];
          var task_limit_blocks = settings.block_parallel_tasks;
          if (task_limit_blocks < 1) { task_limit_blocks = 1; }
          var task_limit_txs = 1;
          for (i=start; i<(end+1); i++) {
            blocks_to_scan.push(i);
          }
          async.eachLimit(blocks_to_scan, task_limit_blocks, function(block_height, next_block) {
            if (block_height % 5000 === 0) {
              Stats.updateOne({coin: coin}, {
                last: block_height - 1,
                last_txs: '' //not used anymore left to clear out existing objects
              }, function() {});
            }
            lib.get_blockhash(block_height, function(blockhash){
              if (blockhash) {
                lib.get_block(blockhash, function(block) {
                  if (block) {
                    async.eachLimit(block.tx, task_limit_txs, function(txid, next_tx) {
                      Tx.findOne({txid: txid}, function(err, tx) {
                        if(tx) {
                          setTimeout( function(){
                            tx = null;
                            next_tx();
                          }, timeout);
                        } else {
                          save_tx(txid, block_height, function(err){
                            if (err) {
                              console.log(err);
                            } else {
                              console.log('%s: %s', block_height, txid);
                            }
                            setTimeout( function(){
                              tx = null;
                              next_tx();
                            }, timeout);
                          });
                        }
                      });
                    }, function(){
                      // The transactions of this height are stored now, which
                      // is what save_block reads its reward and fees from.
                      save_block(block, function(){
                        setTimeout( function(){
                          blockhash = null;
                          block = null;
                          next_block();
                        }, timeout);
                      });
                    });
                  } else {
                    console.log('block not found: %s', blockhash);
                    setTimeout( function(){
                      next_block();
                    }, timeout);
                  }
                });
              } else {
                setTimeout( function(){
                  next_block();
                }, timeout);
              }
            });
          }, function(){
            Tx.find({}).sort({timestamp: 'desc'}).limit(settings.index.last_txs).exec(function(err, txs){
              Stats.updateOne({coin: coin}, {
                last: end,
                last_txs: '' //not used anymore left to clear out existing objects
              }, function() {
                remove_lock("db_index", function(){
                  return cb();
                });
              });
            });
          });
        });
      }
    });
  },

  create_peer: function(params, cb) {
    var newPeer = new Peers(params);
    newPeer.save(function(err) {
      if (err) {
        console.log(err);
        return cb();
      } else {
        return cb();
      }
    });
  },

  find_peer: function(address, cb) {
    Peers.findOne({address: address}, function(err, peer) {
      if (err) {
        return cb(null);
      } else {
        if (peer) {
         return cb(peer);
       } else {
         return cb (null)
       }
      }
    })
  },

  drop_peer: function(address, cb) {
    Peers.deleteOne({address: address}, function(err) {
      if (err) {
        console.log(err);
        return cb();
      } else {
        return cb ()
      }
    })
  },

  drop_peers: function(cb) {
    Peers.deleteMany({}, function(err) {
      if (err) {
        console.log(err);
        return cb();
      } else {
        return cb ()
      }
    })
  },

  get_peers: function(cb) {
    Peers.find({}, function(err, peers) {
      if (err) {
        return cb([]);
      } else {
        return cb(peers);
      }
    });
  }
};
