var request = require('request')
  , settings = require('./settings')
  , Address = require('../models/address');

var base_url = 'http://127.0.0.1:' + settings.port + '/api/';

const Client = require('bitcoin-core');
const client = new Client(settings.wallet);


// returns coinbase total sent as current coin supply
function coinbase_supply(cb) {
  Address.findOne({a_id: 'coinbase'}, function(err, address) {
    if (address) {
      return cb(address.sent);
    } else {
      return cb(0);
    }
  });
}

function rpcCommand(params, cb) {
  client.command([{method: params[0].method, parameters: params[0].parameters}], function(err, response){
    if(err){console.log('Error: ', err); }
    else{
      if(response[0].name == 'RpcError'){
        return cb('There was an error. Check your console.');
      }
      return cb(response[0]);
    }
  });
}

module.exports = {

  convert_to_satoshi: function(amount, cb) {
    // fix to 8dp & convert to string
    var fixed = amount.toFixed(8).toString(); 
    // remove decimal (.) and return integer 
    return cb(parseInt(fixed.replace('.', '')));
  },

  get_hashrate: function(cb) {
    if (settings.index.show_hashrate == false) return cb('-');
    if (settings.use_rpc) {
      if (settings.nethash == 'netmhashps') {
        rpcCommand([{method:'getmininginfo', parameters: []}], function(response){
          if (response == 'There was an error. Check your console.') { return cb(response);}
          if (response.netmhashps) {
            response.netmhashps = parseFloat(response.netmhashps);
            if (settings.nethash_units == 'K') {
              return cb((response.netmhashps * 1000).toFixed(4));
            } else if (settings.nethash_units == 'G') {
              return cb((response.netmhashps / 1000).toFixed(4));
            } else if (settings.nethash_units == 'H') {
              return cb((response.netmhashps * 1000000).toFixed(4));
            } else if (settings.nethash_units == 'T') {
              return cb((response.netmhashps / 1000000).toFixed(4));
            } else if (settings.nethash_units == 'P') {
              return cb((response.netmhashps / 1000000000).toFixed(4));
            } else {
              return cb(response.netmhashps.toFixed(4));
            }
          } else {
            return cb('-');
          }
        });
      } else {
        rpcCommand([{method:'getnetworkhashps', parameters: []}], function(response){
          if (response == 'There was an error. Check your console.') { return cb(response);}
            if (response) {
              response = parseFloat(response);
              if (settings.nethash_units == 'K') {
                return cb((response / 1000).toFixed(4));
              } else if (settings.nethash_units == 'M'){
                return cb((response / 1000000).toFixed(4));
              } else if (settings.nethash_units == 'G') {
                return cb((response / 1000000000).toFixed(4));
              } else if (settings.nethash_units == 'T') {
                return cb((response / 1000000000000).toFixed(4));
              } else if (settings.nethash_units == 'P') {
                return cb((response / 1000000000000000).toFixed(4));
              } else {
                return cb((response).toFixed(4));
              }
            } else {
              return cb('-');
            }
        });
      }
    }else{
      if (settings.nethash == 'netmhashps') {
        var uri = base_url + 'getmininginfo';
        request({uri: uri, json: true}, function (error, response, body) { //returned in mhash
          if (body.netmhashps) {
            if (settings.nethash_units == 'K') {
              return cb((body.netmhashps * 1000).toFixed(4));
            } else if (settings.nethash_units == 'G') {
              return cb((body.netmhashps / 1000).toFixed(4));
            } else if (settings.nethash_units == 'H') {
              return cb((body.netmhashps * 1000000).toFixed(4));
            } else if (settings.nethash_units == 'T') {
              return cb((body.netmhashps / 1000000).toFixed(4));
            } else if (settings.nethash_units == 'P') {
              return cb((body.netmhashps / 1000000000).toFixed(4));
            } else {
              return cb(body.netmhashps.toFixed(4));
            }
          } else {
            return cb('-');
          }
        });
      } else {
        var uri = base_url + 'getnetworkhashps';
        request({uri: uri, json: true}, function (error, response, body) {
          if (body == 'There was an error. Check your console.') {
            return cb('-');
          } else {
            if (settings.nethash_units == 'K') {
              return cb((body / 1000).toFixed(4));
            } else if (settings.nethash_units == 'M'){
              return cb((body / 1000000).toFixed(4));
            } else if (settings.nethash_units == 'G') {
              return cb((body / 1000000000).toFixed(4));
            } else if (settings.nethash_units == 'T') {
              return cb((body / 1000000000000).toFixed(4));
            } else if (settings.nethash_units == 'P') {
              return cb((body / 1000000000000000).toFixed(4));
            } else {
              return cb((body).toFixed(4));
            }
          }
        });
      }
    }
  },


  get_difficulty: function(cb) {
    if (settings.use_rpc) {
      rpcCommand([{method:'getdifficulty', parameters: []}], function(response){
        return cb(response);
      });
    } else {
      var uri = base_url + 'getdifficulty';
      request({uri: uri, json: true}, function (error, response, body) {
        return cb(body);
      });
    }
  },

  get_connectioncount: function(cb) {
    if (settings.use_rpc) {
      rpcCommand([{method:'getconnectioncount', parameters: []}], function(response){
        return cb(response);
      });
    } else {
      var uri = base_url + 'getconnectioncount';
      request({uri: uri, json: true}, function (error, response, body) {
        return cb(body);
      });
    }
  },

  get_blockcount: function(cb) {
    if (settings.use_rpc) {
      rpcCommand([{method:'getblockcount', parameters: []}], function(response){
        return cb(response);
      })
    } else {
      var uri = base_url + 'getblockcount';
      request({uri: uri, json: true}, function (error, response, body) {
        return cb(body);
      });
    }
  },

  get_blockhash: function(height, cb) {
    if (settings.use_rpc) {
      rpcCommand([{method:'getblockhash', parameters: [parseInt(height)]}], function(response){
        return cb(response);
      });
    } else {
      var uri = base_url + 'getblockhash?height=' + height;
      request({uri: uri, json: true}, function (error, response, body) {
        return cb(body);
      });
    }
  },

  get_block: function(hash, cb) {
    if (settings.use_rpc) {
      rpcCommand([{method:'getblock', parameters: [hash]}], function(response){
        return cb(response);
      });
    } else {
      var uri = base_url + 'getblock?hash=' + hash;
      request({uri: uri, json: true}, function (error, response, body) {
        return cb(body);
      });
    }
  },

  get_rawtransaction: function(hash, cb) {
    if (settings.use_rpc) {
      rpcCommand([{method:'getrawtransaction', parameters: [hash, 1]}], function(response){
        return cb(response);
      });
    } else {
      var uri = base_url + 'getrawtransaction?txid=' + hash + '&decrypt=1';
      request({uri: uri, json: true}, function (error, response, body) {
        return cb(body);
      });
    }
  },

  get_maxmoney: function(cb) {
    if (settings.use_rpc) {
      rpcCommand([{method:'getmaxmoney', parameters: []}], function(response){
        return cb(response);
      });
    } else {
      var uri = base_url + 'getmaxmoney';
      request({uri: uri, json: true}, function (error, response, body) {
        return cb(body);
      });
    }
  },

  get_maxvote: function(cb) {
    if (settings.use_rpc) {
      rpcCommand([{method:'getmaxvote', parameters: []}], function(response){
        return cb(response);
      });
    } else {
      var uri = base_url + 'getmaxvote';
      request({uri: uri, json: true}, function (error, response, body) {
        return cb(body);
      }); 
    }
  },

  get_vote: function(cb) {
    if (settings.use_rpc) {
      client.command([{method:'getvote', parameters: []}], function(err, response){
        if(err){console.log('Error: ', err); }
        else{
          if(response[0].name == 'RpcError'){
            return cb('There was an error. Check your console.');
          }
          return cb(response[0]);
        }
      });
    } else {
      var uri = base_url + 'getvote';
      request({uri: uri, json: true}, function (error, response, body) {
        return cb(body);
      }); 
    }
  },

  get_phase: function(cb) {
    if (settings.use_rpc) {
      client.command([{method:'getphase', parameters: []}], function(err, response){
        if(err){console.log('Error: ', err); }
        else{
          if(response[0].name == 'RpcError'){
            return cb('There was an error. Check your console.');
          }
          return cb(response[0]);
        }
      });
    } else {
      var uri = base_url + 'getphase';
      request({uri: uri, json: true}, function (error, response, body) {
        return cb(body);
      }); 
    }
  },

  get_reward: function(cb) {
    if (settings.use_rpc) {
      client.command([{method:'getreward', parameters: []}], function(err, response){
        if(err){console.log('Error: ', err); }
        else{
          if(response[0].name == 'RpcError'){
            return cb('There was an error. Check your console.');
          }
          return cb(response[0]);
        }
      });
    } else {
      var uri = base_url + 'getreward';
      request({uri: uri, json: true}, function (error, response, body) {
        return cb(body);
      }); 
    }
  },

  get_estnext: function(cb) {
    if (settings.use_rpc) {
      client.command([{method:'getnextrewardestimate', parameters: []}], function(err, response){
        if(err){console.log('Error: ', err); }
        else{
          if(response[0].name == 'RpcError'){
            return cb('There was an error. Check your console.');
          }
          return cb(response[0]);
        }
      });
    } else {
      var uri = base_url + 'getnextrewardestimate';
      request({uri: uri, json: true}, function (error, response, body) {
        return cb(body);
      }); 
    }
  },

  get_nextin: function(cb) {
    if (settings.use_rpc) {
      client.command([{method:'getnextrewardwhenstr', parameters: []}], function(err, response){
        if(err){console.log('Error: ', err); }
        else{
          if(response[0].name == 'RpcError'){
            return cb('There was an error. Check your console.');
          }
          return cb(response[0]);
        }
      });
    } else {
      var uri = base_url + 'getnextrewardwhenstr';
      request({uri: uri, json: true}, function (error, response, body) {
        return cb(body);
      }); 
    }
  },
  
  // synchonous loop used to interate through an array, 
  // avoid use unless absolutely neccessary
  syncLoop: function(iterations, process, exit){
    var index = 0,
        done = false,
        shouldExit = false;
    var loop = {
      next:function(){
          if(done){
              if(shouldExit && exit){
                  exit(); // Exit if we're done
              }
              return; // Stop the loop if we're done
          }
          // If we're not finished
          if(index < iterations){
              index++; // Increment our index
              if (index % 100 === 0) { //clear stack
                setTimeout(function() {
                  process(loop); // Run our process, pass in the loop
                }, 1);
              } else {
                 process(loop); // Run our process, pass in the loop
              }
          // Otherwise we're done
          } else {
              done = true; // Make sure we say we're done
              if(exit) exit(); // Call the callback on exit
          }
      },
      iteration:function(){
          return index - 1; // Return the loop number we're on
      },
      break:function(end){
          done = true; // End the loop
          shouldExit = end; // Passing end as true means we still call the exit callback
      }
    };
    loop.next();
    return loop;
  },

  balance_supply: function(cb) {
    Address.find({}, 'balance').where('balance').gt(0).exec(function(err, docs) { 
      var count = 0;
      module.exports.syncLoop(docs.length, function (loop) {
        var i = loop.iteration();
        count = count + docs[i].balance;
        loop.next();
      }, function(){
        return cb(count);
      });
    });
  },

  get_supply: function(cb) {
    if (settings.use_rpc) {
      if ( settings.supply == 'HEAVY' ) {
        client.command([{method:'getsupply', parameters: []}], function(err, response){
          if(err){console.log('Error: ', err); }
          else{
            if(response[0].name == 'RpcError'){
              return cb('There was an error. Check your console.');
            }
            return cb(response[0]);
          }
        });
      } else if (settings.supply == 'GETINFO') {
        client.command([{method:'getinfo', parameters: []}], function(err, response){
          if(err){console.log('Error: ', err); }
          else{
            if(response[0].name == 'RpcError'){
              return cb('There was an error. Check your console.');
            }
            return cb(response[0].moneysupply);
          }
        });
      } else if (settings.supply == 'BALANCES') {
        module.exports.balance_supply(function(supply) {
          return cb(supply/100000000);
        });
      } else if (settings.supply == 'TXOUTSET') {
        client.command([{method:'gettxoutsetinfo', parameters: []}], function(err, response){
          if(err){console.log('Error: ', err); }
          else{
            if(response[0].name == 'RpcError'){
              return cb('There was an error. Check your console.');
            }
            return cb(response[0].total_amount);
          }
        });
      } else {
        coinbase_supply(function(supply) {
          return cb(supply/100000000);
        });
      }
    } else {
      if ( settings.supply == 'HEAVY' ) {
        var uri = base_url + 'getsupply';
        request({uri: uri, json: true}, function (error, response, body) {
          return cb(body);
        });
      } else if (settings.supply == 'GETINFO') {
        var uri = base_url + 'getinfo';
        request({uri: uri, json: true}, function (error, response, body) {
          return cb(body.moneysupply);
        });
      } else if (settings.supply == 'BALANCES') {
        module.exports.balance_supply(function(supply) {
          return cb(supply/100000000);
        });
      } else if (settings.supply == 'TXOUTSET') {
        var uri = base_url + 'gettxoutsetinfo';
        request({uri: uri, json: true}, function (error, response, body) {
          return cb(body.total_amount);
        });
      } else {
        coinbase_supply(function(supply) {
          return cb(supply/100000000);
        });
      }
    }
  },

  is_unique: function(array, object, cb) {
    var unique = true;
    var index = null;
    module.exports.syncLoop(array.length, function (loop) {
      var i = loop.iteration();
      if (array[i].addresses == object) {
        unique = false;
        index = i;
        loop.break(true);
        loop.next();
      } else {
        loop.next();
      }
    }, function(){
      return cb(unique, index);
    });
  },

  /**
  * Network hash rate over a window of blocks, in hashes per second.
  *
  * This is deliberately the calculation getnetworkhashps performs, so that a
  * chart drawn from our own rows and a number read from the daemon do not
  * disagree. Two things in it are easy to get wrong by writing the obvious
  * formula instead:
  *
  *   - The work is the difference in *chainwork* between the ends of the
  *     window, not something derived from difficulty. Difficulty is a
  *     convenience number; chainwork is what the chain actually accumulated.
  *
  *   - The time is max minus min over the window, not last minus first. Block
  *     timestamps are not monotonic -- and on this chain a block's nTime is
  *     the previous block's find time, so the two differ more often than on
  *     chains where they usually coincide.
  *
  * `blocks` are rows carrying `time` and hex `chainwork`, ordered by height
  * ascending. Fewer than two, or a window in which every block claims the same
  * second, gives 0: with no timespan there is no rate to state.
  *
  * The BigInt difference is converted to Number at the end, which is what
  * Core's arith_uint256::getdouble() does too -- a double carries the
  * magnitude easily and the lost digits are far below anything a chart shows.
  */
  hashrate_from_blocks: function(blocks) {
    if (!blocks || blocks.length < 2) { return 0; }
    var first = blocks[0], last = blocks[blocks.length - 1];
    if (!first.chainwork || !last.chainwork) { return 0; }
    var minTime = first.time, maxTime = first.time, i;
    for (i = 1; i < blocks.length; i++) {
      if (blocks[i].time < minTime) { minTime = blocks[i].time; }
      if (blocks[i].time > maxTime) { maxTime = blocks[i].time; }
    }
    if (maxTime <= minTime) { return 0; }
    var work;
    try {
      work = BigInt('0x' + last.chainwork) - BigInt('0x' + first.chainwork);
    } catch (e) {
      return 0;
    }
    if (work <= BigInt(0)) { return 0; }
    return Number(work) / (maxTime - minTime);
  },

  /**
  * Average block time and hash rate over fixed windows that all end now (the
  * last hour, the last day, the last year), for the window charts on /mining.
  * Synchronous and pure like hashrate_from_blocks, so it is testable without a
  * database.
  *
  * `blocks` are rows carrying `height`, `time` and hex `chainwork`, ordered by
  * height ascending and reaching back past the start of the longest window.
  * `now` is a unix time in seconds, `windows` a list of {key, seconds}.
  *
  * For each window:
  *
  *   - a block belongs to it by its own time, not by its place in height
  *     order. Timestamps are not monotonic on this chain, so the first block at
  *     or after the boundary can be followed by one that claims an earlier
  *     second, and that one is left out rather than counted by position. A
  *     block stamped later than `now` still counts. The node accepts up to two
  *     hours ahead, and leaving the newest block out of the last hour would be
  *     the stranger answer.
  *
  *   - the average block time is the window divided by the number of blocks
  *     found in it. It is measured up to `now`, not up to the last block, so a
  *     gap that is still open shows: an hour after the last block the one-hour
  *     window reads sixty minutes, not the spacing before it. A window with no
  *     block at all answers null rather than infinity.
  *
  *   - the hash rate is hashrate_from_blocks over the window's blocks plus the
  *     one just before them, so the work of the first block in the window is
  *     counted. It is the calculation getnetworkhashps performs, not a second
  *     formula that would drift from the node's.
  *
  *   - `history` says whether the rows can answer the window at all. That
  *     needs the block before the first one in the window, and every height
  *     from there to the tip. An interrupted backfill or a sync that skipped a
  *     height leaves holes, and a count across a hole is too low while looking
  *     perfectly plausible. Such a window answers `history: false` and nulls,
  *     which is also what the issue asked for when the record does not reach
  *     back far enough. The check is per window, so a hole three months ago
  *     does not blank the last hour.
  */
  block_windows: function(blocks, now, windows) {
    blocks = blocks || [];
    var last = blocks.length - 1;
    return (windows || []).map(function(w) {
      var since = now - w.seconds;
      var out = {
        window: w.key, seconds: w.seconds, history: false, blocks: 0,
        avg_block_time: null, hashrate: null, from_height: null, to_height: null
      };
      if (!blocks.length) { return out; }
      var first = -1, count = 0, top = null, i;
      for (i = 0; i < blocks.length; i++) {
        if (blocks[i].time < since) { continue; }
        if (first < 0) { first = i; }
        count++;
        top = blocks[i].height;
      }
      if (first < 0) {
        // Nothing since the boundary, and the newest row is older than it:
        // an answer in itself, "no block", whatever lies further back.
        out.history = true;
        return out;
      }
      var base = first - 1;
      if (base < 0 || blocks[last].height - blocks[base].height !== last - base) { return out; }
      out.history = true;
      out.blocks = count;
      out.from_height = blocks[first].height;
      out.to_height = top;
      out.avg_block_time = w.seconds / count;
      var rate = module.exports.hashrate_from_blocks(blocks.slice(base));
      out.hashrate = rate > 0 ? rate : null;
      return out;
    });
  },

  /**
  * Reward, fees and coinbase address of one block, from the transactions the
  * index has already stored for it. Synchronous and pure: given the same rows
  * it always answers the same, which is what makes it testable without a
  * database.
  *
  * Amounts in and out are satoshi, as prepare_vin and prepare_vout leave them.
  *
  * Two details decide whether the sums are right:
  *
  *   - prepare_vin gives a coinbase a synthetic input, {addresses: 'coinbase',
  *     amount: <the whole output>}, so a coinbase nets to zero. It has to be
  *     recognised and set aside rather than summed with the rest, or the block
  *     reward silently counts as a fee of zero and real fees go missing.
  *
  *   - a transaction whose inputs the index could not resolve shows more out
  *     than in. That is missing data, not a negative fee, so it is skipped
  *     instead of subtracted -- otherwise one unresolved input could drag a
  *     block's fees below zero.
  */
  summarize_block_txs: function(txs) {
    var reward = 0, fees = 0, winner = '';
    (txs || []).forEach(function(tx) {
      var vin = (tx && tx.vin) || [], vout = (tx && tx.vout) || [], i;
      var out = 0, inp = 0;
      for (i = 0; i < vout.length; i++) { out += (vout[i].amount || 0); }
      if (vin.length && vin[0].addresses === 'coinbase') {
        reward = out;
        for (i = 0; i < vout.length; i++) {
          if (vout[i].addresses) { winner = vout[i].addresses; break; }
        }
      } else {
        for (i = 0; i < vin.length; i++) { inp += (vin[i].amount || 0); }
        if (inp > out) { fees += inp - out; }
      }
    });
    return {reward: reward, fees: fees, winner: winner};
  },

  calculate_total: function(vout, cb) {
    var total = 0;
    module.exports.syncLoop(vout.length, function (loop) {
      var i = loop.iteration();
      //module.exports.convert_to_satoshi(parseFloat(vout[i].amount), function(amount_sat){
        total = total + vout[i].amount;
        loop.next();
      //});
    }, function(){
      return cb(total);
    });
  },

  /* Bitcoin Core removed scriptPubKey.addresses in v22 and replaced it with the
     singular scriptPubKey.address.  Doichain Core 31.1.3 follows that, so the old
     field is undefined and reading [0] from it threw
     "Cannot read properties of undefined (reading '0')".  Accept both shapes and
     return undefined when an output carries no address at all (bare multisig), so
     the caller skips it instead of storing undefined. */
  vout_address: function(scriptPubKey) {
    if (!scriptPubKey) return undefined;
    if (scriptPubKey.addresses && scriptPubKey.addresses.length > 0) return scriptPubKey.addresses[0];
    return scriptPubKey.address;
  },

  prepare_vout: function(vout, txid, vin, cb) {
    var arr_vout = [];
    var arr_vin = [];
    arr_vin = vin;
    module.exports.syncLoop(vout.length, function (loop) {
      var i = loop.iteration();
      // make sure vout has an address
      if (vout[i].scriptPubKey.type != 'nonstandard' && vout[i].scriptPubKey.type != 'nulldata' && vout[i].scriptPubKey.type != 'pubkey' && module.exports.vout_address(vout[i].scriptPubKey)) { 
        // check if vout address is unique, if so add it array, if not add its amount to existing index
        //console.log('vout:' + i + ':' + txid);
        //console.log(vout[i]);
        module.exports.is_unique(arr_vout, module.exports.vout_address(vout[i].scriptPubKey), function(unique, index) {
          if (unique == true) {
            // unique vout
            module.exports.convert_to_satoshi(parseFloat(vout[i].value), function(amount_sat){
              var entry = {addresses: module.exports.vout_address(vout[i].scriptPubKey), amount: amount_sat};
                  if (vout[i].scriptPubKey.nameOp) entry.nameOp = vout[i].scriptPubKey.nameOp;
                  arr_vout.push(entry);
              loop.next();
            });
          } else {
            // already exists
            module.exports.convert_to_satoshi(parseFloat(vout[i].value), function(amount_sat){
              arr_vout[index].amount = arr_vout[index].amount + amount_sat;
                  if (vout[i].scriptPubKey.nameOp && !arr_vout[index].nameOp)
                    arr_vout[index].nameOp = vout[i].scriptPubKey.nameOp;
              loop.next();
            });
          }
        });
      } else {
        // no address, move to next vout
        loop.next();
      }
    }, function(){
      if (vout[0].scriptPubKey.type == 'nonstandard') {
        if ( arr_vin.length > 0 && arr_vout.length > 0 ) {
          if (arr_vin[0].addresses == arr_vout[0].addresses) {
            //PoS
            arr_vout[0].amount = arr_vout[0].amount - arr_vin[0].amount;
            arr_vin.shift();
            return cb(arr_vout, arr_vin);
          } else {
            return cb(arr_vout, arr_vin);
          }
        } else {
          return cb(arr_vout, arr_vin);
        }
      } else {
        return cb(arr_vout, arr_vin);
      }
    });
  },

  get_input_addresses: function(input, vout, cb) {
    var addresses = [];
    if (input.coinbase) {
      var amount = 0;
      module.exports.syncLoop(vout.length, function (loop) {
        var i = loop.iteration();
          amount = amount + parseFloat(vout[i].value);  
          loop.next();
      }, function(){
        addresses.push({hash: 'coinbase', amount: amount});
        return cb(addresses);
      });
    } else {
      module.exports.get_rawtransaction(input.txid, function(tx){
        if (tx) {
          module.exports.syncLoop(tx.vout.length, function (loop) {
            var i = loop.iteration();
            if (tx.vout[i].n == input.vout) {
              //module.exports.convert_to_satoshi(parseFloat(tx.vout[i].value), function(amount_sat){
              if (module.exports.vout_address(tx.vout[i].scriptPubKey)) {
                addresses.push({hash: module.exports.vout_address(tx.vout[i].scriptPubKey), amount:tx.vout[i].value});  
              }
                loop.break(true);
                loop.next();
              //});
            } else {
              loop.next();
            } 
          }, function(){
            return cb(addresses);
          });
        } else {
          return cb();
        }
      });
    }
  },

  prepare_vin: function(tx, cb) {
    var arr_vin = [];
    module.exports.syncLoop(tx.vin.length, function (loop) {
      var i = loop.iteration();
      module.exports.get_input_addresses(tx.vin[i], tx.vout, function(addresses){
        if (addresses && addresses.length) {
          //console.log('vin');
          module.exports.is_unique(arr_vin, addresses[0].hash, function(unique, index) {
            if (unique == true) {
              module.exports.convert_to_satoshi(parseFloat(addresses[0].amount), function(amount_sat){
                arr_vin.push({addresses:addresses[0].hash, amount:amount_sat});
                loop.next();
              });
            } else {
              module.exports.convert_to_satoshi(parseFloat(addresses[0].amount), function(amount_sat){
                arr_vin[index].amount = arr_vin[index].amount + amount_sat;
                loop.next();
              });
            }
          });
        } else {
          loop.next();
        }
      });
    }, function(){
      return cb(arr_vin);
    });
  }
};
