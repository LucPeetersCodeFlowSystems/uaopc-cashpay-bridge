// DEVELOPMENT: start the simulation OPC server if needed: node .\server.js
// DEVELOPMENT: simulate a transaction: node .\start_transaction.js true 2.10 "Koffie"
// DEVELOPMENT: start the OPC monitor: opcua-commander -e opc.tcp://ULTRABOOK-LUC:1234
// DEVELOPMENT/PROD: start this OPC <-> PC <-> CASHFREE bridge: node .\opcCashFreeBridge.js

// http://node-opcua.github.io/api_doc/classes/OPCUAClient.html

const assert = require('assert');
const request = require('request-promise');
const open = require('opn');
const bodyParser = require('body-parser');
const opc = require("./opc");
const winston = require('winston');
const opcua = require("node-opcua");
const async = require("async");

//require('winston-mongodb');

const argv = require("yargs")
  .wrap(132)

  //.demand("config")
  .string("config")
  .describe("config", "the json file")

  .string("simulation")
  .describe("simulation", "simulation of the startbit: 0|1")

  .string("verbose")
  .describe("verbose", "verbose level: 0|1")

  .alias("c", "config")
  .alias("s", "simulation")
  .alias("v", "verbose")

  .example("node UAOPC-CASHFREE-BRIDGE ")
  .example("node UAOPC-CASHFREE-BRIDGE -c UAOPC-CASHFREE-BRIDGE-LOCAL.json")
  .argv;


const configFile = argv.config || "./UAOPC-CASHFREE-BRIDGE.json";
const config = require(configFile);
const cashfreeConfig = config.cashfreeConfig;
const instance = 0;
var gDB = null;

var MongoClient = require('mongodb').MongoClient;
var url = "mongodb://localhost:27017/cashfreedb";
// https://www.w3schools.com/nodejs/nodejs_mongodb_create_db.asp
MongoClient.connect(url, function (err, db) {
  if (err) throw err;
  console.log("Cashfreedb database connected!");

  gDB = db;

  //winston.add(winston.transports.MongoDB, { db: db });

  start();
})

var my_opc = null;
function start() {
  winston.level = 'error'; //TODO: create argv log level
  winston.info('starting uaopc-cashfree-bridge config:', configFile);
  winston.info('starting uaopc-cashfree-bridge simulation:', argv.simulation);
  winston.info('starting uaopc-cashfree-bridge server:', config.opcserver);

  my_opc = new opc(config.opcserver);
  my_opc.initialize(fnMonitor);
}

const inputTags =
  {
    price: 1.00,
    description: "LUC'S FINE-TUNING",
  }

function fnMonitor(err) {
  if (err) {
    console.error("monitor", err);
    my_opc.disconnect(function () {
      console.error("all disconnected");
      my_opc = new opc(config.opcserver);
      my_opc.initialize(fnMonitor);
    })
    return;
  }


  my_opc.monitor(config.ios[instance].Startbit, function (value) {
    winston.info("PLC<->THIS::MONITOR value=", config.ios[instance].Startbit, value.value.value);
    if (value.value.value == true) {
      if (config.ios[instance].paymentBusy == false) {
        fnStartBitChanged(my_opc);
      }
    }
  });

  // --- some test code
  if (argv.simulation == "1") {
    setTimeout(fnTestBit, 2000);
  }

  fnHeartbeat();
}

function fnStartBitChanged(opc) {


  //assert(opc!=null, "opc can not be null");

  // set the startbit to 0
  // opc.writeBoolean("ns=1;s=startBit", false);

  config.ios[instance].paymentBusy = true;

  async.waterfall(
    [
      function (callback) {
        opc.writeBoolean(config.ios[instance].Startbit, false, function () {
          callback();
        });
      },
      function (callback) {
        opc.writeString(config.ios[instance].paymentURL, "", function () {
          callback();
        });
      },
      function (callback) {
        opc.writeString(config.ios[instance].transactionID, "", function () {
          callback();
        });
      },
      function (callback) {
        opc.writeBoolean(config.ios[instance].transactionSigned, false, function () {
          callback();
        });
      },
      function (callback) {
        opc.readVariableValue(config.ios[instance].cashfreeConfig_apiKey, function (value) {
          if (value.statusCode === opcua.StatusCodes.Good) {
            cashfreeConfig.apiKey = value.value.value;
          }
          else {
            console.error(value.statusCode);
          }
          callback();
        });
      },
      function (callback) {
        opc.readVariableValue(config.ios[instance].cashfreeConfig_profileID, function (value) {
          if (value.statusCode === opcua.StatusCodes.Good) {
            cashfreeConfig.profileID = value.value.value;
          }
          else {
            console.error(value.statusCode);
          }
          callback();
        });
      },
      function (callback) {
        opc.readVariableValue(config.ios[instance].cashfreeConfig_apiLocation, function (value) {
          if (value.statusCode === opcua.StatusCodes.Good) {
            cashfreeConfig.apiLocation = value.value.value;
          }
          else {
            console.error(value.statusCode);
          }
          callback();
        });
      },
      function (callback) {
        opc.readVariableValue(config.ios[instance].transactionAmount, function (value) {
          try {
            if (argv.simulation == "") inputTags.price = -1;
            if (value.statusCode === opcua.StatusCodes.Good) {
              inputTags.price = value.value.value;
              winston.info("THIS<->PLC::READ value=", config.ios[instance].transactionAmount, value.value.value);
            }
          } catch (error) {
            console.log("error", error);
          }
          callback();
        });
      },
      function (callback) {
        opc.readVariableValue(config.ios[instance].transactionDescription, function (value) {
          try {
            if (argv.simulation == "") inputTags.description = null;
            if (value.statusCode === opcua.StatusCodes.Good) {
              inputTags.description = value.value.value;
              winston.info("THIS<->PLC::READ value=", config.ios[instance].transactionDescription, value.value.value);
            }
          } catch (error) {
            console.log("error", error);
          }
          callback();
        });
      }],
    function (err, callback) {
      if (!err) {
        initializePayment(inputTags.price, inputTags.description, opc);
      }
      else {
        console.error(err);
      }
    });
}

function initializePayment(euro, description, opc) {

  const paymentData = {
    apiKey: cashfreeConfig.apiKey,
    profileID: cashfreeConfig.profileID,
    amount: euro.toString(),
    clientReference: description,
    successURL: "http://www.coinmonster.be",
    failureURL: "/fail",
    webhookURL: "/webhook"
  };

  winston.info('THIS<->CASHFREE-API::REQUEST ( POST api/internetpayments/ )', JSON.stringify(paymentData));

  request({
    url: cashfreeConfig.apiLocation + 'api/internetpayments/',
    method: "POST",
    json: true,
    headers: {
      "content-type": "application/json",
    },
    body: paymentData
  })
    .then(function (data) {
      winston.info('THIS<->CASHFREE-API::RESPONSE', JSON.stringify(data));

      gDB.collection("transaction").insert({ transactionId: data.transactionId, request: paymentData, response: data, signed: data.signed, dt_create: Date() });

      writePaymentData2OPC(data, opc);
    })
    .catch(function (error) {
      winston.error('THIS<->CASHFREE-API::RESPONSE-ERROR', error.message);
    });
}

function writePaymentData2OPC(data, opc) {

  // write URL nd/or tcurrent_transactionID to the OPC
  var async = require("async");

  async.series([
    function (callback) {
      opc.writeString(config.ios[instance].paymentURL, data.paymentURL, function (error, statusCodes) {
        callback();
      });
    },
    function (callback) {
      opc.writeString(config.ios[instance].transactionID, data.transactionId, function (error, statusCodes) {
        callback();
      });
    },
    function (callback) {

      winston.info('THIS->PLC::WRITE value=', config.ios[instance].paymentURL, data.paymentURL);
      winston.info('THIS->PLC::WRITE value=', config.ios[instance].transactionID, data.transactionId);

      // if (argv.simulation == "1") {
      open(data.paymentURL);
      // }

      pollUntilPaymentIsSigned(data.transactionId, opc);
    }]);

}

var timer;
function pollUntilPaymentIsSigned(transactionID, opc) {

  timer = setTimeout(function (opc) {

    winston.info('THIS->CASHFREE::REQUEST GET api/internetpayments/:', transactionID);

    var info = request({
      url: cashfreeConfig.apiLocation + 'api/internetpayments/' + transactionID,
      method: "GET",
      json: true,
      headers: {
        "content-type": "application/json",
      }
    });

    info.then(function (data) {
      winston.info('THIS->CASHFREE::RESPONSE data=', JSON.stringify(data));

      var myquery = { transactionId: data.transactionId };
      gDB.collection("transaction").updateOne(myquery, { $set: { poll_response: data, signed: data.signed, dt_update: Date() } });

      if (data.signed == true) {

        winston.info('internetpayments SIGNED:', data);

        opc.writeBoolean(config.ios[instance].transactionSigned, true, function (err, statusCode) {
          config.ios[instance].paymentBusy = false;
        });

      }
      else {

        opc.readVariableValue(config.ios[instance].StopPoll, function (value) {
          if (value.statusCode === opcua.StatusCodes.Good) {
            if (value.value.value == true) {

              gDB.collection("transaction").updateOne(myquery, { $set: { cancelled: true } });
              cancelPoll();
              return;
            }
          }

          pollUntilPaymentIsSigned(transactionID, opc);
        });

        return;
      }
    });

    info.catch(function (error) {
      winston.error('pollUntilPaymentIsSigned :: <- POST api/internetpayments/:' + transactionID, error.message);

      cancelPoll();
    });

  }, 2000, opc);
}

function cancelPoll() {
  config.ios[instance].paymentBusy = false;
  winston.error('polling canceled');
}

var gHeatbeat = true;
function fnHeartbeat() {
  my_opc.writeBoolean(config.ios[instance].Heartbeat, gHeatbeat, function (err, value) {
    gHeatbeat = !gHeatbeat;
    setTimeout(fnHeartbeat, 1000);
  });
}

// ---- some test code
var testBit = false;
var testLoop = 0;
function fnTestBit() {
  if (config.ios[instance].paymentBusy == true) {
    setTimeout(fnTestBit, 2000);
    return;
  }

  testLoop++;
  my_opc.writeDouble(config.ios[instance].transactionAmount, "1.0", function (err, value) {
    my_opc.writeString(config.ios[instance].transactionDescription, "LUC'S FINE-TUNING TEST " + testLoop, function (err, value) {
      my_opc.writeBoolean(config.ios[instance].Startbit, !testBit, function (err, value) {
        setTimeout(fnTestBit, 2000);
      });
    });
  });
}