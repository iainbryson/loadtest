'use strict';

/**
 * Load test a websocket.
 * (C) 2013 Alex Fernández.
 */


// requires
require('prototypes');
var WebSocketClient = require('websocket').client;
var testing = require('testing');
var Log = require('log');
var BaseClient = require('./base-client.js').BaseClient;

// globals
var log = new Log('info');
var latency;

var _client_id = 0;

/**
 * A client that connects to a websocket.
 */
module.exports.WebsocketClient = function(operation, params)
{
	BaseClient.call(this, operation, params);

	// self-reference
	var self = this;

	// attributes
	var connection;
	var lastCall;

	self.client = null;
	self.client_id = _client_id++;

	this.init();

	/**
	 * Start the websocket client.
	 */
	self.start = function()
	{
		var wsOptions = {
			tlsOptions: {
				rejectUnauthorized: !params.insecure,
				key: params.key ? fs.readFileSync(params.key) : undefined,
  			cert: params.cert ? fs.readFileSync(params.cert) : undefined,
			}
		}

		self.requestFinished = undefined;

		self.client = new WebSocketClient(wsOptions);
		self.client.on('connectFailed', function(error) {
			log.debug('WebSocket client ' + self.client_id + ' connection error ' + error);
		});
		self.client.on('connect', connect);
		self.client.connect(params.url, []);
		log.debug('WebSocket client ' + self.client_id + ' connected to ' + params.url);
	};


	self.startRequests = function()
	{
		return self.makeRequest();
	}

	/**
	 * Stop the websocket client.
	 */
	self.stop = function()
	{
		if (connection)
		{
			connection.close();
			log.debug('WebSocket client ' + self.client_id + ' disconnected from ' + params.url);
		}
	};

	/**
	 * Connect the player.
	 */
	function connect(localConnection)
	{
		connection = localConnection;

		// NOTE: there are no per-request callbacks (and no notion of request/response)
		// in the websockets package.  So we can't support requestsPerSecond; everything must
		// be synchronous per connection.

		connection.on('error', function(error) {
			if (!self.requestFinished) return;
			self.requestFinished('Connection (client ' + self.client_id + ') error: ' + error);
		});

		connection.on('close', function() {
			if (!self.requestFinished) return;
			self.requestFinished('Connection (client ' + self.client_id + ') closed ');
		});

		connection.on('message', function(message) {
	
			if (!self.requestFinished) {
				log.debug('got message without being in a request (peculiar)');
				return;
			}

			if (message.type != 'utf8')
			{
				log.error('Invalid message type ' + message.type);
				return;
			}
			var json;
			try
			{
				json = JSON.parse(message.utf8Data);
			}
			catch(e)
			{
				log.error('(client ' + self.client_id + ') Invalid JSON: ' + message.utf8Data);
				return;
			}

			log.debug('(client ' + self.client_id + ') Received response %j', json);

			// eat the client_connected message we get at the beginning
			if ((json && json[0] && json[0][0] == 'client_connected')) {
				return;
			}

			if (lastCall)
			{
				var newCall = new Date().getTime();
				latency.add(newCall - lastCall);
				log.debug('latency: ' + (newCall - lastCall));
				lastCall = null;
			}

			self.requestFinished(null, json);
		});

		self.startRequests();
	}

	/**
	 * Make a single request to the server.
	 */
	self.makeRequest = function()
	{
		log.debug('(client ' + self.client_id + ') begin request ' + (connection.connected ? 'connected' : 'not connected'));

		var id = operation.latency.start(id);
		self.requestFinished = self.getRequestFinisher(id);

		if (connection.connected)
		{
			var request, message;

			if (self.generateMessage)
			{
				message = self.generateMessage(id);
				if(typeof message === 'object')
				{
					message = JSON.stringify(message);
				}
			}

			if (typeof params.requestGenerator == 'function')
			{
				// create a 'fake' object which can function like the http client
				var req = function(options, callback) {
					return {
						write: function(message) {
							connection.sendUTF(message)
						} 
					}
				}
				params.requestGenerator(self.params, self.options, req, self.requestFinished);
			}
			else
			{
				log.debug('sending message');
				connection.sendUTF(JSON.stringify(message));
			}
		}
	}
};


module.exports.WebsocketClient.prototype = Object.create(BaseClient.prototype);
module.exports.WebsocketClient.prototype.constructor = module.exports.WebsocketClient;

module.exports.WebsocketClient.prototype.init = function()
{
    Object.getPrototypeOf(this.constructor.prototype).init.call(this);
};

module.exports.WebsocketClient.prototype.getRequestFinisher = function(id)
{
		var self = this;
    var baseFinisher = Object.getPrototypeOf(this.constructor.prototype).getRequestFinisher.call(this, id);
    return function(error, result) {
    	self.requestFinished = undefined;
    	baseFinisher.apply(self, [error, result]);
    }
};


/**
 * Run tests, currently nothing.
 */
module.exports.test = function(callback)
{
	testing.success(callback);
};

// start load test if invoked directly
if (__filename == process.argv[1])
{
	exports.test(testing.show);
}

