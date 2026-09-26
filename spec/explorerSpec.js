describe('explorer', function() {
  var lib = require('../lib/explorer');
  var data = require('../test/data.js');

  describe('convert_to_satoshi', function() {

    it('should be able to convert round numbers', function() {
      lib.convert_to_satoshi(500, function(amount_sat){
        expect(amount_sat).toEqual(50000000000);
        
      });
    });

    it('should be able to convert decimals above 1', function() {
      lib.convert_to_satoshi(500.12564, function(amount_sat){
        expect(amount_sat).toEqual(50012564000);
        
      });
    });

    it('should be able to convert decimals below 1', function() {
      lib.convert_to_satoshi(0.0005, function(amount_sat){
        expect(amount_sat).toEqual(50000);
        
      });
    });
  });

  describe('is_unique', function() {
  
    var arrayStrMap = [ 
      {'addresses' : 'XsF8k8s5CoS3XATqW2FkuTsznbJJzFAC2U'},
      {'addresses' : 'XsF8k8s5C14FbhqW2FkuATsznFACAfVhUn'},
      {'addresses' : 'XsF8k8s5CoAF5gTqW2FkuTsznbJJzhkj5A'},
      {'addresses' : 'XfuW2K9QiGMSsq5eXgtimEQvTvz9dzBCzb'}
    ];

    var arrayArrMap = [ 
      {'addresses' : ['XsF8k8s5CoS3XATqW2FkuTsznbJJzFAC2U']},
      {'addresses' : ['XsF8k8s5C14FbhqW2FkuATsznFACAfVhUn']},
      {'addresses' : ['XsF8k8s5CoAF5gTqW2FkuTsznbJJzhkj5A']},
      {'addresses' : ['XfuW2K9QiGMSsq5eXgtimEQvTvz9dzBCzb']}
    ];

    it('should return index of matching string object', function() {
      lib.is_unique(arrayStrMap, arrayStrMap[2].addresses, function(unique, index){
        expect(index).toEqual(2);
        expect(unique).toEqual(false);
        
      });
    });

    it('should return index of matching array object', function() {
      lib.is_unique(arrayArrMap, arrayArrMap[2].addresses, function(unique, index){
        expect(index).toEqual(2);
        expect(unique).toEqual(false);
        
      });
    });

    it('should return true if no matching string object', function() {
      lib.is_unique(arrayStrMap, 'unique', function(unique, index){
        expect(index).toEqual(null);
        expect(unique).toEqual(true);
        
      });
    });

    it('should return true if no matching array object', function() {
      lib.is_unique(arrayArrMap, ['unique'], function(unique, index){
        expect(index).toEqual(null);
        expect(unique).toEqual(true);
        
      });
    });
  });

  describe('prepare_vout', function() {
    

    var originalTimeout;
    beforeEach(function() {
      originalTimeout = jasmine.DEFAULT_TIMEOUT_INTERVAL;
      jasmine.DEFAULT_TIMEOUT_INTERVAL = 10000;
    });

    it('should ignore nonstandard outputs', function(done) {
      lib.prepare_vout(data.txA().vout, data.txA().txid, function(prepared) {
        expect(prepared.length).toEqual(152);
        done();  
      });
    });

    it('should maintain order', function(done) {
      lib.prepare_vout(data.txA().vout, data.txA().txid, function(prepared) {
        expect(prepared[150].amount).toEqual(2.1006);
        expect(prepared[150].addresses).toEqual(['XyPreJfnUxSSY1QbYqQxDXpymc26VFQPDV']);
        done();  
      });
    });

    afterEach(function() {
      jasmine.DEFAULT_TIMEOUT_INTERVAL = originalTimeout;
    });

  });

  describe('calculate_total', function() {
    var originalTimeout;

    beforeEach(function() {
      originalTimeout = jasmine.DEFAULT_TIMEOUT_INTERVAL;
      jasmine.DEFAULT_TIMEOUT_INTERVAL = 10000;
    });

    it('should calculate correct total', function(done) {
      lib.prepare_vout(data.txA().vout, data.txA().txid, function(prepared) {
        lib.calculate_total(prepared, function(total) {
          expect(total).toEqual(700200000);
          done();  
        });
      });
    });

    afterEach(function() {
      jasmine.DEFAULT_TIMEOUT_INTERVAL = originalTimeout;
    });
  });

  describe('prepare_vin', function() {
    var originalTimeout;

    beforeEach(function() {
      originalTimeout = jasmine.DEFAULT_TIMEOUT_INTERVAL;
      jasmine.DEFAULT_TIMEOUT_INTERVAL = 10000;
    });

    it('should return array of correct length', function(done) {
      lib.prepare_vin(data.txB(), function(prepared) {
        expect(prepared.length).toEqual(18);
        done();  
      });
    });

    it('should get correct input addresses', function(done) {
      lib.prepare_vin(data.txB(), function(prepared) {
        expect(prepared[3].amount).toEqual(10.00000001);
        expect(prepared[3].addresses).toEqual('XjYC7q5QwG7dGnytYDoCURhL4CATj6WQhZ');
        done();  
      });
    });

    afterEach(function() {
      jasmine.DEFAULT_TIMEOUT_INTERVAL = originalTimeout;
    });
  });

  describe('summarize_block_txs', function() {

    // Shape and values taken from mainnet block 432946: one coinbase paying
    // 12.5 DOI to MzATCB2Xt2DMy5MScZgTzxJxvHJP2mZNYA, no other transactions.
    var coinbase = {
      vin:  [{addresses: 'coinbase', amount: 1250000000}],
      vout: [{addresses: 'MzATCB2Xt2DMy5MScZgTzxJxvHJP2mZNYA', amount: 1250000000}]
    };

    it('should read the reward and the coinbase address', function() {
      var r = lib.summarize_block_txs([coinbase]);
      expect(r.reward).toEqual(1250000000);
      expect(r.winner).toEqual('MzATCB2Xt2DMy5MScZgTzxJxvHJP2mZNYA');
    });

    it('should not count the coinbase as a fee', function() {
      // prepare_vin gives a coinbase an input equal to its output, so summing
      // it with the rest would hide real fees behind a zero.
      expect(lib.summarize_block_txs([coinbase]).fees).toEqual(0);
    });

    it('should take fees from what an ordinary transaction does not spend', function() {
      var spend = {
        vin:  [{addresses: 'A', amount: 1000000}],
        vout: [{addresses: 'B', amount: 900000}]
      };
      var r = lib.summarize_block_txs([coinbase, spend]);
      expect(r.fees).toEqual(100000);
      expect(r.reward).toEqual(1250000000);
    });

    it('should add up fees across several transactions', function() {
      var a = {vin: [{addresses: 'A', amount: 500}], vout: [{addresses: 'B', amount: 400}]};
      var b = {vin: [{addresses: 'C', amount: 900}], vout: [{addresses: 'D', amount: 650}]};
      expect(lib.summarize_block_txs([coinbase, a, b]).fees).toEqual(350);
    });

    it('should ignore a transaction whose inputs could not be resolved', function() {
      // More out than in is missing data, not a negative fee -- one of these
      // must not be able to drag a block's fees below zero.
      var broken = {vin: [], vout: [{addresses: 'B', amount: 700}]};
      var ok = {vin: [{addresses: 'A', amount: 900}], vout: [{addresses: 'B', amount: 800}]};
      var r = lib.summarize_block_txs([coinbase, broken, ok]);
      expect(r.fees).toEqual(100);
    });

    it('should take the first coinbase output that carries an address', function() {
      var split = {
        vin:  [{addresses: 'coinbase', amount: 1250000000}],
        vout: [{amount: 0}, {addresses: 'MinerOne', amount: 1000000000},
               {addresses: 'MinerTwo', amount: 250000000}]
      };
      var r = lib.summarize_block_txs([split]);
      expect(r.winner).toEqual('MinerOne');
      expect(r.reward).toEqual(1250000000);
    });

    it('should answer zeroes for a block it has no transactions for', function() {
      var r = lib.summarize_block_txs([]);
      expect(r.reward).toEqual(0);
      expect(r.fees).toEqual(0);
      expect(r.winner).toEqual('');
      expect(lib.summarize_block_txs(undefined).reward).toEqual(0);
    });
  });

  describe('hashrate_from_blocks', function() {

    // 0x300 - 0x100 = 512 units of work across 8 seconds.
    var simple = [
      {time: 1000, chainwork: '100'},
      {time: 1004, chainwork: '200'},
      {time: 1008, chainwork: '300'}
    ];

    it('should divide the work of the window by its timespan', function() {
      expect(lib.hashrate_from_blocks(simple)).toEqual(64);
    });

    it('should span max and min time, not first and last', function() {
      // Block times are not monotonic, and on this chain a block's nTime is
      // the previous block's find time -- so the last row is regularly not
      // the latest second in the window. Same work, same span, same answer.
      var jumbled = [
        {time: 1000, chainwork: '100'},
        {time: 1008, chainwork: '200'},
        {time: 1004, chainwork: '300'}
      ];
      expect(lib.hashrate_from_blocks(jumbled)).toEqual(64);
    });

    it('should read chainwork as hex, not as a decimal string', function() {
      // 0x10 is 16, not 10: a decimal reading would answer 5 here.
      expect(lib.hashrate_from_blocks([
        {time: 0, chainwork: '0'}, {time: 2, chainwork: '10'}
      ])).toEqual(8);
    });

    it('should carry a full-width chainwork value', function() {
      // The real ones are 64 hex characters and far beyond a double's
      // integer range; the subtraction has to happen before that conversion.
      var lo = '00000000000000000000000000000000000000000002bf8b03190dfb372d328f';
      var hi = '00000000000000000000000000000000000000000002bf8b03190dfb372d428f';
      // The two differ by 0x1000 = 4096, over 8 seconds.
      expect(lib.hashrate_from_blocks([
        {time: 100, chainwork: lo}, {time: 108, chainwork: hi}
      ])).toEqual(512);
    });

    it('should answer zero when there is no timespan to divide by', function() {
      expect(lib.hashrate_from_blocks([
        {time: 500, chainwork: '100'}, {time: 500, chainwork: '900'}
      ])).toEqual(0);
    });

    it('should answer zero for too few blocks', function() {
      expect(lib.hashrate_from_blocks([])).toEqual(0);
      expect(lib.hashrate_from_blocks([{time: 1, chainwork: '100'}])).toEqual(0);
      expect(lib.hashrate_from_blocks(undefined)).toEqual(0);
    });

    it('should answer zero rather than guess when chainwork is missing or malformed', function() {
      expect(lib.hashrate_from_blocks([
        {time: 0, chainwork: ''}, {time: 8, chainwork: '300'}
      ])).toEqual(0);
      expect(lib.hashrate_from_blocks([
        {time: 0, chainwork: 'not hex'}, {time: 8, chainwork: '300'}
      ])).toEqual(0);
    });

    it('should answer zero if the window does not gain work', function() {
      expect(lib.hashrate_from_blocks([
        {time: 0, chainwork: '300'}, {time: 8, chainwork: '100'}
      ])).toEqual(0);
    });
  });

  describe('block_windows', function() {

    // Ten blocks, one every 100 seconds, each adding 0x100 = 256 units of
    // work. The last one was found at 1900, and `now` is 2000, a hundred seconds
    // into a gap that is still open.
    var blocks = [];
    for (var h = 1; h <= 10; h++) {
      blocks.push({height: h, time: 1000 + (h - 1) * 100, chainwork: (h * 256).toString(16)});
    }
    var NOW = 2000;
    function copy(rows) {
      return rows.map(function(b) { return {height: b.height, time: b.time, chainwork: b.chainwork}; });
    }
    function one(seconds, rows, now) {
      return lib.block_windows(rows || blocks, now || NOW, [{key: 'w', seconds: seconds}])[0];
    }

    it('should count the blocks whose own time falls in the window', function() {
      // Since 1500: the blocks at 1500, 1600, 1700, 1800, 1900.
      var w = one(500);
      expect(w.history).toBe(true);
      expect(w.blocks).toEqual(5);
      expect(w.from_height).toEqual(6);
      expect(w.to_height).toEqual(10);
    });

    it('should divide the window by the blocks found in it', function() {
      expect(one(500).avg_block_time).toEqual(100);
      expect(one(300).avg_block_time).toEqual(100);
      // One block since 1880, in a two-minute window.
      expect(one(120).avg_block_time).toEqual(120);
    });

    it('should measure up to now, so a gap that is still open raises the average', function() {
      // At 2300 the last block is 400 seconds old. Since 1800 there are the
      // blocks at 1800 and 1900: 500 / 2 = 250. Measured to the last block
      // instead, it would read the 100-second spacing.
      var w = one(500, blocks, 2300);
      expect(w.blocks).toEqual(2);
      expect(w.avg_block_time).toEqual(250);
    });

    it('should answer null, not infinity, for a window with no block', function() {
      // Nothing since 1950: the last block is fifty seconds too old.
      var w = one(50);
      expect(w.history).toBe(true);
      expect(w.blocks).toEqual(0);
      expect(w.avg_block_time).toBeNull();
      expect(w.hashrate).toBeNull();
      expect(w.from_height).toBeNull();
    });

    it('should take the hash rate from the block before the window to the tip', function() {
      // Block 5, the one before the window since 1500, is moved to 1350 so
      // that leaving it out would show: with it the work of blocks 6 to 10 is
      // 1280 over 1900 - 1350 = 550 seconds, without it 1024 over 400.
      var rows = copy(blocks);
      rows[4].time = 1350;
      var w = one(500, rows);
      expect(w.hashrate).toBeCloseTo(1280 / 550, 9);
      expect(w.hashrate).toEqual(lib.hashrate_from_blocks(rows.slice(4)));
    });

    it('should decide membership by time, not by height order', function() {
      // Block 8 claims 1550, a second before block 7 at 1600. With the
      // boundary at 1580, block 7 is in and block 8 is out although it is
      // higher. Counting from the first block past the boundary would have
      // taken both.
      var rows = copy(blocks);
      rows[7].time = 1550;
      var w = one(420, rows);
      expect(w.blocks).toEqual(3);
      expect(w.from_height).toEqual(7);
      expect(w.to_height).toEqual(10);
    });

    it('should count a block stamped later than now', function() {
      // The node accepts timestamps up to two hours ahead. The newest block
      // exists, so it belongs to the last hour even if its clock ran fast.
      var rows = copy(blocks);
      rows[9].time = NOW + 60;
      var w = one(120, rows);
      expect(w.blocks).toEqual(1);
      expect(w.to_height).toEqual(10);
    });

    it('should report missing history instead of averaging over the part it has', function() {
      // The rows start at 1000. A window since 900 reaches past them, and one
      // since exactly 1000 has no block before it to take the work from.
      [1100, 1000].forEach(function(seconds) {
        var w = one(seconds);
        expect(w.history).toBe(false);
        expect(w.blocks).toEqual(0);
        expect(w.avg_block_time).toBeNull();
        expect(w.hashrate).toBeNull();
      });
      expect(lib.block_windows([], NOW, [{key: 'w', seconds: 60}])[0].history).toBe(false);
    });

    it('should treat a hole in the heights as missing history, but only where it lies', function() {
      // Block 7 is missing, as after an interrupted backfill. The window since
      // 1500 spans the hole and would count four blocks instead of five, so it
      // answers no history instead. The window since 1850 lies after the hole
      // and is unaffected.
      var rows = copy(blocks).filter(function(b) { return b.height !== 7; });
      var across = one(500, rows);
      expect(across.history).toBe(false);
      expect(across.avg_block_time).toBeNull();
      var after = one(150, rows);
      expect(after.history).toBe(true);
      expect(after.blocks).toEqual(1);
    });

    it('should answer every window in the order given, with its key and length', function() {
      var out = lib.block_windows(blocks, NOW, [{key: 'short', seconds: 120}, {key: 'long', seconds: 900}]);
      expect(out.map(function(w) { return w.window; })).toEqual(['short', 'long']);
      expect(out.map(function(w) { return w.seconds; })).toEqual([120, 900]);
      expect(out[1].blocks).toEqual(9);
    });
  });
});
