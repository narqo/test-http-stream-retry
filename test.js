var url = require('url');
var mitm = require('mitm');
var ask = require('./index');

const urlToAsk = 'http://yandex.net';

var server = mitm();

var attempt = 0;

server.on('request', function(req, res) {
    ++attempt;

    if (attempt < 2) {
        res.statusCode = 501;
        return res.end('service is not available');
    }

    res.end('deal with it\n');
});

function test(prefix, fn) {
    process.nextTick(function() {
        console.error(prefix);
        fn();
    });
}

//test('1. test streaming', function() {
//    ask({
//        url: urlToAsk
//    }).pipe(process.stdout);
//});

test('2. test streaming with retries', function() {
    ask({
        url: urlToAsk,
        maxRetries: 1
    }).pipe(process.stdout);
});
