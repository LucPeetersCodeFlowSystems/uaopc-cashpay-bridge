"use strict";

var opcua = require("node-opcua");
var async = require("async");
var winston = require('winston');

class opc {
  constructor(opcendpointUrl) {
    this.client = new opcua.OPCUAClient({ keepSessionAlive: true });
    this.endpointUrl = opcendpointUrl;

    if (opcendpointUrl === undefined)
    {
      this.endpointUrl = "opc.tcp://" + require("os").hostname() + ":1234";
    }
    this.subscription = null;
    this.session = null;
  }

  start (startmonitor_callback) {

    this.startmonitor_callback = startmonitor_callback;

    var my = this;

    // ----- OPC stuff
    async.series([

      // step 1 : connect t
      function (callback) {

        my.client.connect(my.endpointUrl, function (err) {

          if (err) {
            winston.error("OPC: cannot connect to endpoint :", my.endpointUrl);
          } else {
            winston.info("OPC: connected to:", my.endpointUrl);
          }
          callback(err);
        });
      },
      // step 2 : createSession
      function (callback) {
        my.client.createSession(function (err, session) {
          if (!err) {
            my.session = session;
          }
          callback(err);
        });

      },

      // step 5: install a subscription and monitored item
      //
      // -----------------------------------------
      // create subscription
      function (callback) {
        my.startmonitor_callback(my);
      },

      // ------------------------------------------------
      // closing session
      //
      function (callback) {
        console.log(" closing session");
        my.session.close(function (err) {

          console.log(" session closed");
          callback();
        });
      },
    ],
      function (err) {
        if (err) {
          console.log(" failure ", err);
        } else {
          console.log("done!")
        }
        this.client.disconnect(function () { });
      });
  }

  monitor (id, monitorCallback) {
    this.monitorCallback = monitorCallback;
    var my = this;

      const parameters = {
        requestedPublishingInterval: 100,
        requestedLifetimeCount: 1000,
        requestedMaxKeepAliveCount: 12,
        maxNotificationsPerPublish: 100,
        publishingEnabled: true,
        priority: 10
    };

    var newSub = new opcua.ClientSubscription(my.session, parameters);

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
      my.monitorCallback(value);
    });
  };

  writeBoolean (nodeToWrite, value) {
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
            winston.error("OPC: cannot writeBool:", nodesToWrite, err, statusCode);
          } else {
            winston.info("OPC: writeBool OK", nodesToWrite, statusCodes);
          }
    });
  };

  writeString (nodeToWrite, value) {
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
            winston.error("OPC: cannot writeString:", nodesToWrite, err, statusCode);
          } else {
            winston.info("OPC: writeString OK", nodesToWrite, statusCodes);
          }
    });
  };

  writeDouble (nodeToWrite, value) {
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
  };

  readVariableValue (id, readCallback) {
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