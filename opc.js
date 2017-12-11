"use strict";

var opcua = require("node-opcua");
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
      defaultSecureTokenLifetime: 400000,
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

  async initialize() {
    return new Promise((resolve, reject) => {

      var self = this;

      self.client.connect(self.endpointUrl, function (err) {
        if (err) {
          winston.error("THIS->OPC:cannot connect to endpoint :", err);
          return;
        }

        winston.debug("THIS->OPC:client connected.");

        self.createSession(() => { resolve() });
      });
    });
  }

  createSession(callback) {
    let self = this;
    self.client.createSession(function (err, session) {
      if (err) {
        winston.error("THIS->OPC:cannot createSession :", err);
        return;
      }
      self.session = session;

      winston.debug("THIS->OPC:session created.");

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

  monitor(id, callback) {
    this.monitorCallback = callback;
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


    winston.debug("THIS->OPC:monitoring item:", id);

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
            value: value
          }
        }
      }];

    my.session.write(nodesToWrite, function (err, statusCodes) {
      if (err) {
        winston.error("THIS->OPC:cannot writeBool:", JSON.stringify(nodesToWrite), err);
      } else {
        winston.debug("THIS->OPC:writeBool OK", JSON.stringify(nodesToWrite), value);
      }

      if (cb) cb(err, statusCodes);
    });
  };

  writeAsync(nodeToWrite, value) {
    return new Promise((resolve, reject) => {

      winston.debug("OPC::writeAsync", JSON.stringify(nodeToWrite), value);

      var my = this;

      var dataType = null;
      if (typeof value == "boolean") dataType = opcua.DataType.Boolean;
      else if (typeof value == "string") dataType = opcua.DataType.String;
      else if (typeof value == "number") dataType = opcua.DataType.Double;

      if (dataType == null) { resole(false); return; }

      var nodesToWrite = [
        {
          nodeId: nodeToWrite,
          attributeId: opcua.AttributeIds.Value,
          value: { /* dataValue*/
            value: { /* Variant */
              dataType: dataType,
              value: value
            }
          }
        }];

      my.session.write(nodesToWrite, function (err, statusCodes) {
        if (!err) {
          if (statusCodes[0] === opcua.StatusCodes.Good) {
            winston.debug("OPC::writeAsync", nodeToWrite, "OK");
            resolve(true);
            return;
          }
        }

        winston.warn("OPC::writeAsync", nodeToWrite, JSON.stringify(statusCodes), (err ? JSON.stringify(err) : null), "NOK");
        resolve(null);
        return;
      });
    });
  };

  readAsync(id, readCallback) {
    return new Promise((resolve, reject) => {
      var my = this;

      winston.debug("OPC::readAsync", id);
      
      my.session.readVariableValue(id, function (err, dataValue) {
        if (!err) {
          if (dataValue.statusCode === opcua.StatusCodes.Good) {
            winston.debug("THIS->OPC:readAsync", id, dataValue.value.value, "OK");

            resolve(dataValue.value.value);
            return;
          }
        }

        winston.warn("OPC::readAsync", id, JSON.stringify(dataValue), (err ? JSON.stringify(err) : null), "NOK");
        
        resolve(null);
        return;
      });
    });

  }
};

module.exports = opc;