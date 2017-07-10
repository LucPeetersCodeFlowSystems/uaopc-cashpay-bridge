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

//const config = require("./UAOPC-CASHFREE-BRIDGE.json");
const config = require("./UAOPC-CASHFREE-BRIDGE.json");
const cashfreeConfig = config.cashfreeConfig;

winston.info('STARTING UAOPC-CASHFREE-BRIDGE');
const opc_endpoint = config.opcserver;

const inputTags =
  {
    price: 0.00,
    description: "",
  }

let instance = 0;

var my_opc = new opc(opc_endpoint);
my_opc.initialize(fnMonitor);

var TestBit = false;

function fnTestBit() {
  my_opc.writeBoolean(config.ios[instance].Startbit, !TestBit, function () {
    setTimeout(fnTestBit, 2000);
  });
}

function fnMonitor(err) {
  if (err) {
    console.error("monitor", err);
    my_opc.disconnect(function () {
      console.error("all disconnected");
      my_opc = new opc(opc_endpoint);
      my_opc.initialize(fnMonitor);
    })
    return;
  }
  //setTimeout(fnTestBit, 2000);

  my_opc.monitor(config.ios[instance].Startbit, function (value) {
    if (value.value.value == true) {
      if (config.ios[instance].paymentBusy == false) {
        config.ios[instance].paymentBusy = true;
        fnStartBitChanged(my_opc);
      }
    }
  });
}

function fnStartBitChanged(opc) {

  //assert(opc!=null, "opc can not be null");

  // set the startbit to 0
  // opc.writeBoolean("ns=1;s=startBit", false);
  async.waterfall(
    [
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
            inputTags.price = -1;
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
            inputTags.description = null;
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

  winston.info('-> POST api/internetpayments/:', paymentData);

  request({
    url: cashfreeConfig.apiLocation + 'api/internetpayments/',
    method: "POST",
    json: true,
    headers: {
      "content-type": "application/json",
    },
    body: paymentData
  },
    function (error, response, body) {

      if (!error && response.statusCode === 201) {

        winston.info('<- POST api/internetpayments/: [%d] [%s] [%s]', response.statusCode, body.transactionId, body.paymentURL);

        // write URL nd/or tcurrent_transactionID to the OPC
        var async = require("async");

        async.series([
          function (callback) {
            opc.writeString(config.ios[instance].paymentURL, body.paymentURL, function (error, statusCodes) {
              callback();
            });
          },
          function (callback) {
            opc.writeString(config.ios[instance].transactionID, body.transactionId, function (error, statusCodes) {
              callback();
            });
          },
          function (callback) {
            //open(body.paymentURL);
            pollPayment(body.transactionId, opc);
          }]);
      }
      else {
        winston.error('response internetpayments: [%s]', error);
      }
    });
}

function verifyPayment(transactionID, euro, description, tunnelUrl) {

  const internetpaymentRequestData = {
    apiKey: cashfreeConfig.apiKey,
    profileID: cashfreeConfig.profileID
  };

  winston.info('-> GET api/internetpayments/: [%s]', transactionID);

  return request({
    url: cashfreeConfig.apiLocation + 'api/internetpayments/' + transactionID,
    method: "GET",
    json: true,
    headers: {
      "content-type": "application/json",
    },
    body: internetpaymentRequestData
  },
    function (error, response, body) {
      winston.info('<- GET api/internetpayments/: [%d] [%s]', response.statusCode, transactionID);

      if (!error) {
        return body;
      }
      else {
        winston.error('<- GET api/internetpayments/: [%d] [%s]', response.statusCode, error);
        return body;
      }
    });
}

var timer;
function pollPayment(transactionID, opc) {

  var lpc = opc;
  timer = setTimeout(function (apc) {

    var info = verifyPayment(transactionID);

    info.then(function (data) {
      // check if the transaction has been signed
      if (data.signed == true) {
        // write to the PLC
        winston.info('internetpayments SIGNED: [%s]', transactionID);
        winston.debug('internetpayments SIGNED: [%s]', data);

        apc.writeBoolean(config.ios[instance].transactionSigned, true, function (err, statusCode) {
          winston.info(config.ios[instance].transactionSigned, "[TRUE]");
          config.ios[instance].paymentBusy = false;
        });

        return;
      }
      else {
        winston.info('internetpayments NOTSIGNED: [%s]', transactionID);
      }

      pollPayment(transactionID, opc);
    });

  }, 2000, lpc);
}





