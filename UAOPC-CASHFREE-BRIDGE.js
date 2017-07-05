// DEVELOPMENT: start the simulation OPC server if needed: node .\server.js
// DEVELOPMENT: simulate a transaction: node .\start_transaction.js true 2.10 "Koffie"
// DEVELOPMENT: start the OPC monitor: opcua-commander -e opc.tcp://ULTRABOOK-LUC:1234
// DEVELOPMENT/PROD: start this OPC <-> PC <-> CASHFREE bridge: node .\opcCashFreeBridge.js

const request = require('request-promise');
const open = require('opn');
const bodyParser = require('body-parser');
const opc = require("./opc");
const winston = require('winston');
const opcua = require("node-opcua");

const config = require("./UAOPC-CASHFREE-BRIDGE.json");
const cashfreeConfig = config.cashfreeConfig;

winston.info('STARTING UAOPC-CASHFREE-BRIDGE');
const opc_endpoint = config.opcserver;

const inputTags =
  {
    price: 0.01,
    description: "TEST VIA PLC",
  }

let instance = 0;

function readOPCstartPayment(opc) {
  // set the startbit to 0
  // opc.writeBoolean("ns=1;s=startBit", false);
  var async = require("async");

  async.series([
    function (callback) {
      opc.writeDouble(config.ios[instance].tranactionAmount, inputTags.price);
      callback();
    },
    function (callback) {
      opc.writeString(config.ios[instance].transactionDescription, inputTags.description);
      callback();
    },
    function (callback) {
      opc.writeString(config.ios[instance].paymentURL, "");
      callback();
    },
    function (callback) {
      opc.writeString(config.ios[instance].transactionID, "");
      callback();
    },
    function (callback) {
      opc.writeBoolean(config.ios[instance].transactionSigned, false);
      callback();
    },
    function (callback) {
      opc.readVariableValue(config.ios[instance].tranactionAmount, function (value) {
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
    function (callback) {
      initializePayment(inputTags.price, inputTags.description, opc);
      callback();

    });

}

const my_opc = new opc(opc_endpoint);
my_opc.start(function () {
  my_opc.monitor(config.ios[instance].Startbit, function (value) {
    if (value.value.value == true) {
      if (config.ios[instance].paymentBusy == false) {
        config.ios[instance].paymentBusy = true;
        readOPCstartPayment(my_opc);
      }
    }
  });
});

function initializePayment(euro, description, opc) {

  const paymentData = {
    apiKey: cashfreeConfig.apiKey,
    profileID: cashfreeConfig.profileID,
    amount: euro.toString(),
    clientReference: description,
    successURL: "/success",
    failureURL: "/fail",
    webhookURL: "/webhook"
  };

  winston.info('-> POST api/internetpayments/: [%s] [%d]', paymentData.clientReference, paymentData.amount);

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

      winston.info('<- POST api/internetpayments/: [%d] [%s] [%s]', response.statusCode, body.transactionId, body.paymentURL);

      if (!error && response.statusCode === 201) {

        open(body.paymentURL);

        // write URL nd/or tcurrent_transactionID to the OPC
        var async = require("async");

        async.series([
          function (callback) {
            opc.writeString(config.ios[instance].paymentURL, body.paymentURL);
            callback();
          },
          function (callback) {
            opc.writeString(config.ios[instance].transactionID, body.transactionId);
            callback();
          }]);

        pollPayment(body.transactionId, opc);
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

        apc.writeBoolean(config.ios[instance].transactionSigned, true);

        winston.info(config.ios[instance].transactionSigned, "[TRUE]");

        config.ios[instance].paymentBusy = false;

        return;
      }
      else {
        winston.info('internetpayments NOTSIGNED: [%s]', transactionID);
      }

      pollPayment(transactionID, opc);
    });

  }, 2000, lpc);
}





