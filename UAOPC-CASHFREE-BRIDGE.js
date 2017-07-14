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

const argv = require("yargs")
  .wrap(132)

  //.demand("config")
  .string("config")
  .describe("config", "the json file")

  .string("simulation")
  .describe("simulation", "simulation of the startbit")

  .alias("c", "config")
  .alias("s", "simulation")

  .example("node UAOPC-CASHFREE-BRIDGE ")
  .example("node UAOPC-CASHFREE-BRIDGE -c UAOPC-CASHFREE-BRIDGE-LOCAL.json")
  .argv;

const configFile = argv.config || "./UAOPC-CASHFREE-BRIDGE.json";
winston.info('starting uaopc-cashfree-bridge config:', configFile);

const config = require(configFile);
const cashfreeConfig = config.cashfreeConfig;
const instance = 0;

winston.info('starting uaopc-cashfree-bridge simulation:', argv.simulation);
winston.info('starting uaopc-cashfree-bridge server:', config.opcserver);

const inputTags =
  {
    price: 1.00,
    description: "LUC'S FINE-TUNING",
  }

var my_opc = new opc(config.opcserver);
my_opc.initialize(fnMonitor);

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
    if (value.value.value == true) {
      if (config.ios[instance].paymentBusy == false) {
        config.ios[instance].paymentBusy = true;
        fnStartBitChanged(my_opc);
      }
    }
  });
  
  // --- some test code
  if (argv.simulation == "1") {
    setTimeout(fnTestBit, 2000);
  }
}

function fnStartBitChanged(opc) {

  //assert(opc!=null, "opc can not be null");

  // set the startbit to 0
  // opc.writeBoolean("ns=1;s=startBit", false);
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
          try {
            if (value.statusCode === opcua.StatusCodes.Good) {
              cashfreeConfig.apiKey = value.value.value;
            }
            else {
              console.error(value.statusCode);
            }
          } catch (error) {
            console.error("error apiKey", error);
          }
          callback();
        });
      },
      function (callback) {
        opc.readVariableValue(config.ios[instance].cashfreeConfig_profileID, function (value) {
          try {
            if (value.statusCode === opcua.StatusCodes.Good) {
              cashfreeConfig.profileID = value.value.value;
            }
            else {
              console.error(value.statusCode);
            }
          } catch (error) {
            console.error("error profileID", error);
          }
          callback();
        });
      },
      function (callback) {
        opc.readVariableValue(config.ios[instance].cashfreeConfig_apiLocation, function (value) {
          try {
            if (value.statusCode === opcua.StatusCodes.Good) {
              cashfreeConfig.apiLocation = value.value.value;
            }
            else {
              console.error(value.statusCode);
            }
          } catch (error) {
            console.error("error apiLocation", error);
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
              console.log("inputTags.price", value.value.value);
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
              console.log("inputTags.description", value.value.value);
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

  winston.info('initializePayment :: -> POST api/internetpayments/:', paymentData);

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
      winston.info('initializePayment :: <- POST api/internetpayments/:', data);
      writePaymentData2OPC(data, opc);
    })
    .catch(function (error) {
      winston.error('initializePayment :: <- POST api/internetpayments/:', error.message);

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

      if (argv.simulation == "1") {
        open(data.paymentURL);
      }

      pollUntilPaymentIsSigned(data.transactionId, opc);
    }]);

}

var timer;
function pollUntilPaymentIsSigned(transactionID, opc) {

  timer = setTimeout(function (opc) {

    winston.info('-> GET api/internetpayments/: [%s]', transactionID);

    var info = request({
      url: cashfreeConfig.apiLocation + 'api/internetpayments/' + "x" + transactionID,
      method: "GET",
      json: true,
      headers: {
        "content-type": "application/json",
      }
    });

    info.then(function (data) {
      // check if the transaction has been signed
      if (data.signed == true) {
        // write to the PLC
        winston.info('internetpayments SIGNED:', data);

        opc.writeBoolean(config.ios[instance].transactionSigned, true, function (err, statusCode) {
          config.ios[instance].paymentBusy = false;
        });

        return;
      }
      else {
        winston.warn('internetpayments NOT SIGNED:', data);
      }

      pollUntilPaymentIsSigned(transactionID, opc);
    });

    info.catch(function (error) {
      winston.error('pollUntilPaymentIsSigned :: <- POST api/internetpayments/:'+ transactionID, error.message);

    });

  }, 2000, opc);
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
  my_opc.writeDouble(config.ios[instance].transactionAmount, "0.1", function (err, value) {
    my_opc.writeString(config.ios[instance].transactionDescription, "LUC'S FINE-TUNING TEST " + testLoop, function (err, value) {
      my_opc.writeBoolean(config.ios[instance].Startbit, !testBit, function (err, value) {
        setTimeout(fnTestBit, 2000);
      });
    });
  });
}