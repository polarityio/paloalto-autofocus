'use strict';

let request = require('request');
let _ = require('lodash');
let util = require('util');
let net = require('net');
let config = require('./config/config');
let async = require('async');
let fs = require('fs');
let Logger;
let requestWithDefaults;
let previousDomainRegexAsString = '';


const MAX_PARALLEL_LOOKUPS = 10;
const THROTTLE_INTERVAL = 60000;
const THROTTLE_MAX_REQUESTS = 17;





function startup(logger) {
    Logger = logger;
    let defaults = {};

    if (typeof config.request.cert === 'string' && config.request.cert.length > 0) {
        defaults.cert = fs.readFileSync(config.request.cert);
    }

    if (typeof config.request.key === 'string' && config.request.key.length > 0) {
        defaults.key = fs.readFileSync(config.request.key);
    }

    if (typeof config.request.passphrase === 'string' && config.request.passphrase.length > 0) {
        defaults.passphrase = config.request.passphrase;
    }

    if (typeof config.request.ca === 'string' && config.request.ca.length > 0) {
        defaults.ca = fs.readFileSync(config.request.ca);
    }

    if (typeof config.request.proxy === 'string' && config.request.proxy.length > 0) {
        defaults.proxy = config.request.proxy;
    }

    requestWithDefaults = request.defaults(defaults);
}

let numLookupsInThrottleWindow = 0;
let lastThrottleWindowStartTime = Date.now();

function throttle(execFunc, throttledCB){
  if(Date.now() - lastThrottleWindowStartTime > THROTTLE_INTERVAL){
      numLookupsInThrottleWindow = 0;
      lastThrottleWindowStartTime = Date.now();
      }

  if(numLookupsInThrottleWindow < THROTTLE_MAX_REQUESTS){
    numLookupsInThrottleWindow++;
    execFunc();
  }else{
    throttledCB(null);
  }
}
/**
 *
 * @param entities
 * @param options
 * @param cb
 */


function doLookup(entities, options, cb) {

    //Logger.debug({options: options}, 'Options');


    let lookupResults = [];
    let entityObj = entities;

    //Logger.debug({entity: entityObj}, "Entity Objects");


    if (typeof(options.apiKey) !== 'string' || options.apiKey.length === 0) {
        cb("The API key is not set.");
        return;
    }
        async.each(entities, function (entityObj, next) {
          if (entityObj.isSHA256) {
            throttle(function(){
                createSha256Cookie(entityObj, options, function(err, token) {
                  _lookupEntitySha256(entityObj, options, token, function (err, result) {
                    if (err) {
                        next(err);
                    } else {
                        Logger.debug({results: result}, "Logging Sha256 results");
                        lookupResults.push(result);
                        next(null);
                    }
                });
            });
          }, function(){
              next('Your lookup for [' + entityObj.value + '] was throttled.');
          })
          }else if (entityObj.isMD5) {
            throttle(function(){
                createMd5Cookie(entityObj, options, function(err, token) {
                  _lookupEntityMd5(entityObj, options, token, function (err, result) {
                    if (err) {
                        next(err);
                    } else {
                        Logger.debug({results: result}, "Logging MD5 results");
                        lookupResults.push(result);
                        next(null);
                    }
                });
            });
          }, function(){
              next('Your lookup for [' + entityObj.value + '] was throttled.');
          });
          }else if (entityObj.isSHA1) {
              throttle(function(){
                createSha1Cookie(entityObj, options, function(err, token) {
                  _lookupEntitySha1(entityObj, options, token, function (err, result) {
                    if (err) {
                        next(err);
                    } else {
                        Logger.debug({results: result}, "Logging SHA1 results");
                        lookupResults.push(result);
                        next(null);
                    }
                });
            });
            }, function(){
              next('Your lookup for [' + entityObj.value + '] was throttled.');
            });
          }else {
                lookupResults.push({entity: entityObj, data: null}); //Cache the missed results
                next(null);
            }
          }, function(err) {
            Logger.debug({lookup: lookupResults}, "Checking to see if the results are making its way to lookupresults");
            cb(err, lookupResults);
      });
}

var createSha256Cookie = function (entityObj, options, cb) {

    let requestOptions = {
        uri: 'https://autofocus.paloaltonetworks.com/api/v1.0/samples/search/',
        method: 'POST',
        body:
{
   "apiKey": options.apiKey,
   "query":{
      "operator":"all",
      "children":[
         {
            "field":"sample.sha256",
            "operator":"is",
            "value": entityObj.value
         }
      ]
   },
   "size":50,
   "from":0,
   "sort":{
      "create_date":{
         "order":"desc"
      }
   },
   "scope":"public"
},
        json: true
    };

    requestWithDefaults(requestOptions, function (err, response, body) {
        let errorObject = _isApiError(err, response, body);
        if (errorObject) {
            cb(errorObject);
            return;
        }

        let afCookie = body.af_cookie;

        cb(null, afCookie);
    });
};

var createMd5Cookie = function (entityObj, options, cb) {

    let requestOptions = {
        uri: options.url + '/api/v1.0/samples/search/',
        method: 'POST',
        body:
{
   "apiKey": options.apiKey,
   "query":{
      "operator":"all",
      "children":[
         {
            "field":"sample.md5",
            "operator":"is",
            "value": entityObj.value
         }
      ]
   },
   "size":50,
   "from":0,
   "sort":{
      "create_date":{
         "order":"desc"
      }
   },
   "scope":"public"
},
        json: true
    };

    requestWithDefaults(requestOptions, function (err, response, body) {
        let errorObject = _isApiError(err, response, body);
        if (errorObject) {
            cb(errorObject);
            return;
        }

        Logger.trace({body:body}, "Checking to see if the afCookie is getting passed in now");

        let afCookie = body.af_cookie;

        cb(null, afCookie);
    });
};

var createSha1Cookie = function (entityObj, options, cb) {

    let requestOptions = {
        uri: options.url + '/api/v1.0/samples/search/',
        method: 'POST',
        body:
{
   "apiKey": options.apiKey,
   "query":{
      "operator":"all",
      "children":[
         {
            "field":"sample.sha1",
            "operator":"is",
            "value": entityObj.value
         }
      ]
   },
   "size":50,
   "from":0,
   "sort":{
      "create_date":{
         "order":"desc"
      }
   },
   "scope":"public"
},
        json: true
    };

    requestWithDefaults(requestOptions, function (err, response, body) {
        let errorObject = _isApiError(err, response, body);
        if (errorObject) {
            cb(errorObject);
            return;
        }


        let afCookie = body.af_cookie;

        cb(null, afCookie);
    });
};


function _lookupEntitySha256(entityObj, options, token, cb) {

    let requestOptions = {
        uri: 'https://autofocus.paloaltonetworks.com/api/v1.0/samples/results/' + token,
        method: 'POST',
        body: {
            "apiKey": options.apiKey
        },
        json: true
    };

    Logger.trace({request: requestOptions}, "Checking the request options in the sha lookup");

    requestWithDefaults(requestOptions, function (err, response, body) {
        let errorObject = _isApiError(err, response, body, entityObj.value);
        if (errorObject) {
            cb(errorObject);
            return;
        }


      Logger.trace({data: body}, "Logging Body Data of the sha256");

        if (_.isNull(body)){
          cb(null, {
              entity: entityObj,
              data: null
          });
          return;
        }
        if (_.isEmpty(body.hits)) {
            cb(null, {
                entity: entityObj,
                data: null
            });
            return;
        }

        if (_isLookupMiss(response)) {
            cb(null, {
                entity: entityObj,
                data: null
            });
            return;
        }


        // The lookup results returned is an array of lookup objects with the following format
        cb(null, {
            // Required: This is the entity object passed into the integration doLookup method
            entity: entityObj,
            // Required: An object containing everything you want passed to the template
            data: {
                // We are constructing the tags using a custom summary block so no data needs to be passed here
                summary: [],
                // Data that you want to pass back to the notification window details block
                details: { entity: entityObj.value, body: body}
            }
        });
    });
}

function _lookupEntityMd5(entityObj, options, token, cb) {

    let requestOptions = {
        uri: 'https://autofocus.paloaltonetworks.com/api/v1.0/samples/results/' + token,
        method: 'POST',
        body: {
            "apiKey": options.apiKey
        },
        json: true
    };

    Logger.trace({request: requestOptions}, "Checking the request options in the MD5 lookup");

    requestWithDefaults(requestOptions, function (err, response, body) {
        let errorObject = _isApiError(err, response, body, entityObj.value);
        if (errorObject) {
            cb(errorObject);
            return;
        }

      Logger.trace({data: body}, "Logging Body Data of the MD5 Hash");

        if (_.isNull(body)){
          cb(null, {
              entity: entityObj,
              data: null
          });
          return;
        }
        if (_.isEmpty(body.hits)) {
            cb(null, {
                entity: entityObj,
                data: null
            });
            return;
        }

        if (_isLookupMiss(response)) {
            cb(null, {
                entity: entityObj,
                data: null
            });
            return;
        }


        // The lookup results returned is an array of lookup objects with the following format
        cb(null, {
            // Required: This is the entity object passed into the integration doLookup method
            entity: entityObj,
            // Required: An object containing everything you want passed to the template
            data: {
                // We are constructing the tags using a custom summary block so no data needs to be passed here
                summary: [],
                // Data that you want to pass back to the notification window details block
                details: { entity: entityObj.value, body: body}
            }
        });
    });
}

function _lookupEntitySha1(entityObj, options, token, cb) {

    let requestOptions = {
        uri: 'https://autofocus.paloaltonetworks.com/api/v1.0/samples/results/' + token,
        method: 'POST',
        body: {
            "apiKey": options.apiKey
        },
        json: true
    };

    Logger.trace({request: requestOptions}, "Checking the request options in the sha lookup");

    requestWithDefaults(requestOptions, function (err, response, body) {
        let errorObject = _isApiError(err, response, body, entityObj.value);
        if (errorObject) {
            cb(errorObject);
            return;
        }

      Logger.trace({data: body}, "Logging Body Data of the sha1");

        if (_.isNull(body)){
          cb(null, {
              entity: entityObj,
              data: null
          });
          return;
        }
        if (_.isEmpty(body.hits)) {
            cb(null, {
                entity: entityObj,
                data: null
            });
            return;
        }

        if (_isLookupMiss(response)) {
            cb(null, {
                entity: entityObj,
                data: null
            });
            return;
        }


        // The lookup results returned is an array of lookup objects with the following format
        cb(null, {
            // Required: This is the entity object passed into the integration doLookup method
            entity: entityObj,
            // Required: An object containing everything you want passed to the template
            data: {
                // We are constructing the tags using a custom summary block so no data needs to be passed here
                summary: [],
                // Data that you want to pass back to the notification window details block
                details: { entity: entityObj.value, body: body}
            }
        });
    });
}

function _isLookupMiss(response) {
    return response.statusCode === 404 || response.statusCode === 500;
}

function _isApiError(err, response, body, entityValue) {
    if (err) {
        return err;
    }

    if (response.statusCode === 500) {
        return _createJsonErrorPayload("Internal Error", null, '500', '1', 'Internal Error', {
            err: err
        });
    }

    if (response.statusCode === 503) {
        return _createJsonErrorPayload("API Minute Bucket Exceeded", null, '503', '1', 'API Minute Bucket Exceeded', {
            err: err
        });
    }

    // Any code that is not 200 and not 404 (missed response), we treat as an error
    if (response.statusCode !== 200 && response.statusCode !== 404) {
        return body;
    }

    return null;
}

// function that takes the ErrorObject and passes the error message to the notification window
var _createJsonErrorPayload = function (msg, pointer, httpCode, code, title, meta) {
    return {
        errors: [
            _createJsonErrorObject(msg, pointer, httpCode, code, title, meta)
        ]
    }
};

var _createJsonErrorObject = function (msg, pointer, httpCode, code, title, meta) {
    let error = {
        detail: msg,
        status: httpCode.toString(),
        title: title,
        code: 'PAAF_' + code.toString()
    };

    if (pointer) {
        error.source = {
            pointer: pointer
        };
    }

    if (meta) {
        error.meta = meta;
    }

    return error;
};

function validateOptions(userOptions, cb) {
    let errors = [];
    if (typeof userOptions.apiKey.value !== 'string' ||
        (typeof userOptions.apiKey.value === 'string' && userOptions.apiKey.value.length === 0)) {
        errors.push({
            key: 'apiKey',
            message: 'You must provide an AutoFocus API key'
        })
    }

    cb(null, errors);
}

module.exports = {
    doLookup: doLookup,
    startup: startup,
    validateOptions: validateOptions
};
