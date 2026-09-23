var mongoose = require('mongoose')
  , Schema = mongoose.Schema;

/**
* One document per block.
*
* The explorer was built without this: block pages ask the daemon over RPC at
* request time, so nothing ever recorded what the chain looked like an hour
* ago. That is fine for a page about one block and useless for a chart, which
* is why anything time-based -- hashrate, difficulty, rewards, block spacing --
* had no data source at all.
*
* Amounts are satoshi, the same unit Tx.total and the vin/vout amounts use.
*
* `chainwork` is kept as the hex string the daemon reports. Two of those plus
* the two block times give the hashrate over any window by exactly the
* calculation getnetworkhashps performs, rather than a second formula that
* would quietly disagree with the node.
*
* `winner` is the first coinbase output address. It is a payout destination,
* not an operator: one operator may use many addresses and a pool pays out to
* many. Label it accordingly wherever it is shown.
*/
var BlockSchema = new Schema({
  height:     { type: Number, unique: true, index: true },
  hash:       { type: String, index: true },
  time:       { type: Number, index: true },
  difficulty: { type: Number, default: 0 },
  chainwork:  { type: String, default: '' },
  size:       { type: Number, default: 0 },
  txcount:    { type: Number, default: 0 },
  reward:     { type: Number, default: 0 },
  fees:       { type: Number, default: 0 },
  winner:     { type: String, default: '', index: true },
}, {id: false});

module.exports = mongoose.model('Block', BlockSchema);
