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
});
