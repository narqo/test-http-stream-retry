var http = require('http');
var url = require('url');
var assign = require('object-assign');
var pump = require('pump');
var duplexify = require('duplexify');
var through2 = require('through2');
var retry = require('retry');
var unzipResponse = require('unzip-response');
var concat = require('concat-stream');

const debug = require('util').debuglog('askertest');

const HTTP_PROTO_RE = /^https?:\/\//ig;

function Request(opts_, cb) {
    var opts = assign({
        method: 'GET'
    }, opts_);

    opts.method = opts.method.toUpperCase();

    if (opts.url) {
        // allow url without protocol (use 'http' by default)
        if (!HTTP_PROTO_RE.test(opts.url)) {
            opts.url = 'http://' + opts.url;
        }

        var parsedUrl = url.parse(opts.url, true);

        opts.protocol = parsedUrl.protocol;
        opts.host = opts.hostname = parsedUrl.hostname;
        opts.port = parseInt(parsedUrl.port, 10);
        opts.path = parsedUrl.path;
    }

    // set default port (80 for http and 443 for https)
    if (! opts.port) {
        opts.port = opts.protocol === 'https:' ? 443 : 80;
    }

    this.options = opts;

    this.retrier = retry.operation({
        retries: this.options.maxRetries,
        minTimeout: this.options.minRetriesTimeout,
        maxTimeout: this.options.maxRetriesTimeout
    });

    this._executionTimer = null;

    if (typeof cb === 'function') {
        this._callback = cb;
    } else {
        this._callback = null;
    }
}

Request.prototype._checkNetworkError = function(statusCode) {
    return statusCode > 499 ? new Error('UNEXPECTED_STATUS_CODE') : null;
};

Request.prototype._tryHttpRequest = function(stream, opts) {
    var self = this;
    var reqStream = duplexify();
    var tmpStream = through2();
    var done = true;

    var handleResp = function(err, res) {
        if (err === null) {
            err = self._checkNetworkError(res.statusCode);
            debug('http request networkError?', err);
        }

        if (err) {
            tmpStream.destroy(err);

            debug('http retry request');
            if (self.retrier.retry(err)) {
                debug('http retry done');
                return;
            }

            err = new Error('RETRIES_LIMIT_EXCEEDED');
        }

        stream.emit('response', res);

        if (err) {
            debug('http max retries exceeded', err);

            var concatStream = concat(function(bufferOrError) {
                done = true;
                err.body = bufferOrError.slice(0, 1500).toString(); // why not?
                stream.destroy(err);
            });

            return pump(tmpStream, concatStream, function(topLevelError) {
                debug('http done?', done, topLevelError);
                stream.destroy(err);
            });
        }

        reqStream.setReadable(unzipResponse(res));
        pump(tmpStream, stream);

        res.on('error', function(err) {
            debug('http response error', err);
            // todo
        });
    };

    var req = http.request(opts);

    req.on('response', function(res) {
        debug('http request response');
        handleResp(null, res);
    });

    req.on('error', function(err) {
        debug('http request error', err);
        handleResp(err);
    });

    if (typeof opts.body !== 'undefined') {
        req.write(opts.body);
    }

    req.end();

    pump(reqStream, tmpStream);
};

Request.prototype.execute = function() {
    var self = this;
    var stream = through2();
    var opts = this.options;

    this.retrier.attempt(function() {
        self._tryHttpRequest(stream, opts);
    });

    if (self._callback) {
        stream.once('responce', function(res) {
            self._callback.call(self, null, res)
        });
        stream.once('error', function(err) {
            self._callback.call(self, err);
        });
    }

    return stream;
};

function buildTimerId(id) {
    return id;
}

exports = module.exports = function(opts, cb) {
    return new Request(opts, cb).execute();
};

exports.Request = Request;
