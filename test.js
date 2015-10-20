var url = require('url');
var mitm = require('mitm');
var Request = require('./index');

const urlToAsk = 'http://yandex.net';

function ask(opts) {
    return new Request(opts).execute();
}

var server = mitm();

var attempt = 0;
var maxAttempts = 2;

server.on('request', function(req, res) {
    if (attempt++ < maxAttempts) {
        res.statusCode = 501;
        res.end('service is not available');
    }
    res.end('here\'s your response!\n');
});

ask({
    url: urlToAsk,
    maxRetries: 2
}).pipe(process.stdout);
