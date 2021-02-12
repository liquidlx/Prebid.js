/**
 * Analytics adapter for Alright analytics
 */

var events = require('../src/events.js');
var utils = require('../src/utils.js');
var CONSTANTS = require('../src/constants.json');
var adapterManager = require('../src/adapterManager.js').default;

var BID_REQUESTED = CONSTANTS.EVENTS.BID_REQUESTED;
var BID_TIMEOUT = CONSTANTS.EVENTS.BID_TIMEOUT;
var BID_RESPONSE = CONSTANTS.EVENTS.BID_RESPONSE;
var BID_WON = CONSTANTS.EVENTS.BID_WON;

var _analyticsQueue = [];
var _enableCheck = true;
// var _category = 'Prebid.js Bids';
var _eventCount = 0;
var _enableDistribution = false;
var _cpmDistribution = null;
var _trackerSend = null;
var _sampled = true;

var _paq = window._paq = window._paq || [];

let adapter = {};

/**
 * This will enable sending data to alright analytics. Only call once, or duplicate data will be sent!
 * @param  {object} provider use to set AA global (if renamed);
 * @param  {object} options use to configure adapter;
 * @return {[type]}    [description]
 */
adapter.enableAnalytics = function ({ provider, options }) {
  _trackerSend = options && options.trackerName ? options.trackerName + '.send' : 'send';
  _sampled = typeof options === 'undefined' || typeof options.sampling === 'undefined' ||
             Math.random() < parseFloat(options.sampling);

  if (options && typeof options.enableDistribution !== 'undefined') {
    _enableDistribution = options.enableDistribution;
  }
  if (options && typeof options.cpmDistribution === 'function') {
    _cpmDistribution = options.cpmDistribution;
  }

  var bid = null;

  if (_sampled) {
    // first send all events fired before enableAnalytics called

    var existingEvents = events.getEvents();

    utils._each(existingEvents, function (eventObj) {
      if (typeof eventObj !== 'object') {
        return;
      }
      var args = eventObj.args;

      if (eventObj.eventType === BID_REQUESTED) {
        bid = args;
        sendBidRequestToAa(bid);
      } else if (eventObj.eventType === BID_RESPONSE) {
        // bid is 2nd args
        bid = args;
        sendBidResponseToAa(bid);
      } else if (eventObj.eventType === BID_TIMEOUT) {
        const bidderArray = args;
        sendBidTimeouts(bidderArray);
      } else if (eventObj.eventType === BID_WON) {
        bid = args;
        sendBidWonToAa(bid);
      }
    });

    // Next register event listeners to send data immediately

    // bidRequests
    events.on(BID_REQUESTED, function (bidRequestObj) {
      sendBidRequestToAa(bidRequestObj);
    });

    // bidResponses
    events.on(BID_RESPONSE, function (bid) {
      sendBidResponseToAa(bid);
    });

    // bidTimeouts
    events.on(BID_TIMEOUT, function (bidderArray) {
      sendBidTimeouts(bidderArray);
    });

    // wins
    events.on(BID_WON, function (bid) {
      sendBidWonToAa(bid);
    });
  } else {
    utils.logMessage('Prebid.js alright analytics disabled by sampling');
  }

  // finally set this function to return log message, prevents multiple adapter listeners
  this.enableAnalytics = function _enable() {
    return utils.logMessage(`Analytics adapter already enabled, unnecessary call to \`enableAnalytics\`.`);
  };
};

adapter.getTrackerSend = function getTrackerSend() {
  return _trackerSend;
};

/**
 * Check if _paq is defined on page. If defined execute all commands
 */
function checkAnalytics() {
  if (_enableCheck && _paq) {
    for (var i = 0; i < _analyticsQueue.length; i++) {
      _analyticsQueue[i].call();
    }

    // override push to execute the command immediately from now on
    _analyticsQueue.push = function (fn) {
      fn.call();
    };

    // turn check into NOOP
    _enableCheck = false;
  }

  utils.logMessage('event count sent to Alright Analytics: ' + _eventCount);
}

function convertToCents(dollars) {
  if (dollars) {
    return Math.floor(dollars * 100);
  }

  return 0;
}

function getLoadTimeDistribution(time) {
  var distribution;
  if (time >= 0 && time < 200) {
    distribution = '0-200ms';
  } else if (time >= 200 && time < 300) {
    distribution = '0200-300ms';
  } else if (time >= 300 && time < 400) {
    distribution = '0300-400ms';
  } else if (time >= 400 && time < 500) {
    distribution = '0400-500ms';
  } else if (time >= 500 && time < 600) {
    distribution = '0500-600ms';
  } else if (time >= 600 && time < 800) {
    distribution = '0600-800ms';
  } else if (time >= 800 && time < 1000) {
    distribution = '0800-1000ms';
  } else if (time >= 1000 && time < 1200) {
    distribution = '1000-1200ms';
  } else if (time >= 1200 && time < 1500) {
    distribution = '1200-1500ms';
  } else if (time >= 1500 && time < 2000) {
    distribution = '1500-2000ms';
  } else if (time >= 2000) {
    distribution = '2000ms above';
  }

  return distribution;
}

function getCpmDistribution(cpm) {
  if (_cpmDistribution) {
    return _cpmDistribution(cpm);
  }
  var distribution;
  if (cpm >= 0 && cpm < 0.5) {
    distribution = '$0-0.5';
  } else if (cpm >= 0.5 && cpm < 1) {
    distribution = '$0.5-1';
  } else if (cpm >= 1 && cpm < 1.5) {
    distribution = '$1-1.5';
  } else if (cpm >= 1.5 && cpm < 2) {
    distribution = '$1.5-2';
  } else if (cpm >= 2 && cpm < 2.5) {
    distribution = '$2-2.5';
  } else if (cpm >= 2.5 && cpm < 3) {
    distribution = '$2.5-3';
  } else if (cpm >= 3 && cpm < 4) {
    distribution = '$3-4';
  } else if (cpm >= 4 && cpm < 6) {
    distribution = '$4-6';
  } else if (cpm >= 6 && cpm < 8) {
    distribution = '$6-8';
  } else if (cpm >= 8) {
    distribution = '$8 above';
  }

  return distribution;
}

function sendBidRequestToAa(bid) {
  if (bid && bid.bidderCode) {
    _analyticsQueue.push(function () {
      _eventCount++;
      _paq.push(['trackEvent', `Prebid - ${bid.bidderCode}`, 'Requests']);
    });
  }

  // check the queue
  checkAnalytics();
}

function sendBidResponseToAa(bid) {
  if (bid && bid.bidderCode) {
    _analyticsQueue.push(function () {
      var cpmCents = convertToCents(bid.cpm);
      var bidder = bid.bidderCode;
      if (typeof bid.timeToRespond !== 'undefined' && _enableDistribution) {
        _eventCount++;
        var dis = getLoadTimeDistribution(bid.timeToRespond);
        _paq.push(['trackEvent', 'Prebid.js Load Time Distribution', dis, bidder]);
      }

      if (bid.cpm > 0) {
        _eventCount = _eventCount + 2;
        var cpmDis = getCpmDistribution(bid.cpm);
        if (_enableDistribution) {
          _eventCount++;
          _paq.push(['trackEvent', 'Prebid.js CPM Distribution', cpmDis, bidder]);
        }

        _paq.push(['trackEvent', `Prebid - ${bidder}`, 'Bids', `${cpmCents}`]);
        _paq.push(['trackEvent', `Prebid - ${bidder}`, 'Bid Load Time', `${bid.timeToRespond}`]);
      }
    });
  }

  // check the queue
  checkAnalytics();
}

function sendBidTimeouts(timedOutBidders) {
  _analyticsQueue.push(function () {
    utils._each(timedOutBidders, function (bidderCode) {
      _eventCount++;
      var bidderName = bidderCode.bidder;
      _paq.push(['trackEvent', `Prebid - ${bidderName}`, 'Timeouts']);
    });
  });

  checkAnalytics();
}

function sendBidWonToAa(bid) {
  var cpmCents = convertToCents(bid.cpm);
  _analyticsQueue.push(function () {
    _eventCount++;
    _paq.push(['trackEvent', `Prebid - ${bid.bidderCode}`, 'Wins', `${cpmCents}`]);
  });

  checkAnalytics();
}

/**
 * Exposed for testing purposes
 */
adapter.getCpmDistribution = getCpmDistribution;

adapterManager.registerAnalyticsAdapter({
  adapter,
  code: 'alright'
});

export default adapter;
