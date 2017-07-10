"use strict";

var opcua = require("node-opcua");
var async = require("async");
var winston = require('winston');
const chalk = require("chalk");

const data = {
  reconnectionCount: 0,
  tokenRenewalCount: 0,
  receivedBytes: 0,
  sentBytes: 0,
  sentChunks: 0,
  receivedChunks: 0,
  backoffCount: 0,
  transactionCount: 0,
};

class opc {


  constructor(opcendpointUrl) {
    this.endpointUrl = opcendpointUrl;

    if (opcendpointUrl === undefined) {
      this.endpointUrl = "opc.tcp://" + require("os").hostname() + ":1234";
    }
    this.subscription = null;
    this.session = null;

    const options = {
      defaultSecureTokenLifetime: 40000,
      connectionStrategy: {
        maxRetry: 100,
        initialDelay: 1000,
        maxDelay: 2000
      },
      keepSessionAlive: true
    };

    this.client = new opcua.OPCUAClient(options);

    this.client.on("backoff", function (number, delay) {
      data.backoffCount += 1;
      console.log(chalk.yellow(`backoff  attempt #${number} retrying in ${delay / 1000.0} seconds (${this.endpointUrl})`));
    });

    this.client.on("start_reconnection", function () {
      console.log(chalk.red(" !!!!!!!!!!!!!!!!!!!!!!!!  Starting reconnection !!!!!!!!!!!!!!!!!!! " + this.endpointUrl));
    });

    this.client.on("connection_reestablished", function () {
      console.log(chalk.red(" !!!!!!!!!!!!!!!!!!!!!!!!  CONNECTION RE-ESTABLISHED !!!!!!!!!!!!!!!!!!! " + this.endpointUrl));
      data.reconnectionCount++;
    });

    this.client.on("after_reconnection", function () {
      console.log(chalk.red(" !!!!!!!!!!!!!!!!!!!!!!!!  After reconnection !!!!!!!!!!!!!!!!!!! " + this.endpointUrl));


    });

    // monitoring des lifetimes
    this.client.on("lifetime_75", function (token) {
      console.log(chalk.red("received lifetime_75 on " + this.endpointUrl));
    });

    this.client.on("security_token_renewed", function () {
      data.tokenRenewalCount += 1;
      console.log(chalk.green(" security_token_renewed on " + this.endpointUrl));
    });
  }

  initialize(callback) {
    var self = this;
    self.startmonitor_callback = callback;

    self.client.connect(self.endpointUrl, function (err) {
      if (err) {
        winston.error("OPC: cannot connect to endpoint :", err);
        return;
      }

      winston.info("OPC: client connected.");

      self.createSession(callback);
    });
  }

  createSession(callback) {
    let self = this;
    self.client.createSession(function (err, session) {
      if (err) {
        winston.error("OPC: cannot createSession :", err);
        return;
      }
      self.session = session;

      winston.info("OPC: session created.");

      session.on("session_closed", function (statusCode) {
        winston.error("session_closed");
        self.session = null;

        callback(statusCode);
      });

      callback();
    });
  }

  disconnect(callback) {
    let self = this;
    if (!self.session) {
        self.client.disconnect(function (err) {
            callback(err);
        });
    } else {
        self.session.close(function () {
            self.client.disconnect(function (err) {
                callback(err);
            });
        });
    }
}

  monitor(id, monitorCallback) {
    this.monitorCallback = monitorCallback;
    var self = this;

    const parameters = {
      requestedPublishingInterval: 100,
      requestedLifetimeCount: 1000,
      requestedMaxKeepAliveCount: 12,
      maxNotificationsPerPublish: 100,
      publishingEnabled: true,
      priority: 10
    };

    var newSub = new opcua.ClientSubscription(self.session, parameters);

    newSub.on("terminated", function()
    {
        console.error("ClientSubscription terminated");
    });

    newSub.on("status_changed", function(statusCode, diagnosticInfo)
    {
        console.error("status_changed", statusCode, diagnosticInfo );
    });

     
 
    var lnode = opcua.resolveNodeId(id);

    const monitoredItem1 = newSub.monitor({
      nodeId: lnode,
      attributeId: opcua.AttributeIds.Value
      //, dataEncoding: { namespaceIndex: 0, name:null }
    }, {
        samplingInterval: 1000,
        discardOldest: true,
        queueSize: 100
      });


    winston.info("OPC: monitoring item:", id);

    // subscription.on("item_added",function(monitoredItem){
    //xx monitoredItem.on("initialized",function(){ });
    //xx monitoredItem.on("terminated",function(value){ });

    monitoredItem1.on("changed", function (value) {
      self.monitorCallback(value);
    });
  };

  writeBoolean(nodeToWrite, value, cb) {
    var my = this;
    var nodesToWrite = [
      {
        nodeId: nodeToWrite,
        attributeId: opcua.AttributeIds.Value,
        value: { /* dataValue*/
          value: { /* Variant */
            dataType: opcua.DataType.Boolean,
            value: value,
            
          }
        }
      }];

    my.session.write(nodesToWrite, function (err, statusCodes) {
      if (err) {
        winston.error("OPC: cannot writeBool:", nodesToWrite, err, statusCode);
      } else {
        winston.info("OPC: writeBool OK", nodesToWrite, statusCodes);
      }

      cb(err, statusCodes);
    });
  };

  writeString(nodeToWrite, value, cb) {
    var my = this;
    var nodesToWrite = [
      {
        nodeId: nodeToWrite,
        attributeId: opcua.AttributeIds.Value,
        value: { /* dataValue*/
          value: { /* Variant */
            dataType: opcua.DataType.String,
            value: value
          }
        }
      }];

    my.session.write(nodesToWrite, function (err, statusCodes) {
      if (err) {
        winston.error("OPC: cannot writeString:", nodesToWrite, err);
      } else {
        winston.info("OPC: writeString OK", nodesToWrite, statusCodes);
      }
      cb(err, statusCodes);
    });
  };

  writeDouble(nodeToWrite, value, cb) {
    var my = this;
    var nodesToWrite = [
      {
        nodeId: nodeToWrite,
        attributeId: opcua.AttributeIds.Value,
        value: { /* dataValue*/
          value: { /* Variant */
            dataType: opcua.DataType.Double,
            value: value
          }
        }
      }];

    my.session.write(nodesToWrite, function (err, statusCodes) {
      if (err) {
        winston.error("OPC: cannot writeDouble:", nodesToWrite, err, statusCode);
      } else {
        winston.info("OPC: writeDouble OK", nodesToWrite, statusCodes);
      }
    });

    cb(err, statusCodes);
  };

  readVariableValue(id, readCallback) {
    this.readCallback = readCallback;
    var my = this;

    my.session.readVariableValue(id, function (err, dataValue) {
      if (!err) {
        my.readCallback(dataValue);
      }
    });
  }
};

module.exports = opc;