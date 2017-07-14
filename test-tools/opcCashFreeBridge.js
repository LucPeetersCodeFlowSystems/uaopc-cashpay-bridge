// DEVELOPMENT: start the simulation OPC server if needed: node .\server.js
// DEVELOPMENT: simulate a transaction: node .\start_transaction.js true 2.10 "Koffie"
// DEVELOPMENT: start the OPC monitor: opcua-commander -e opc.tcp://ULTRABOOK-LUC:1234
// DEVELOPMENT/PROD: start this OPC <-> PC <-> CASHFREE bridge: node .\opcCashFreeBridge.js

const request = require('request-promise');
const open = require('opn');
const bodyParser = require('body-parser');
const opc = require("./opc");
const winston = require('winston');

winston.info('STARTING UAOPC-EASYPAY-BRIDGE');

const http_local_port = 8080;

const cashfreeConfig = {
  apiKey: 'f6197f4c-8813-4af3-b615-f845f1e3477a',
  profileID: 'a3aefe40-9a1a-4f9f-8e38-4c9ab6416ef1',
  apiLocation: 'https://icapps-nodejs-cashfree-api-sta.herokuapp.com/'
};

const inputTags =
  {
    price: 0.0,
    description: "",
    tunnelUrl: ""
  }

function startMonior(opc) {
  opc.monitor("ns=1;s=startBit", function (value) {
    if (value.value.value == true) {

      // set the startbit to 0
      setTimeout(function () {
        opc.writeString("ns=1;s=paymentURL", "");
        opc.writeBoolean("ns=1;s=startBit", false);
        opc.writeBoolean("ns=1;s=transactionSigned", false);

        var async = require("async");

        async.series([
          function (callback) {
            opc.readVariableValue("ns=1;s=transactionAmount", function (value) {
              inputTags.price = value.value.value;
              callback();
            });
          },
          function (callback) {
            opc.readVariableValue("ns=1;s=transactionDescription", function (value) {
              inputTags.description = value.value.value;
              callback();
            });
          }],
          function (callback) {
            initializePayment(inputTags.price, inputTags.description, inputTags.tunnelUrl, opc);
            callback();
          });

      }, 1);
    }
  });
}

//const opc_endpoint = "opc.tcp://...." ; .... fix this -> fix ip in the network ?,...,... think on this!
const opc_endpoint = "opc.tcp://" + require("os").hostname() + ":1234";
const my_opc = new opc(opc_endpoint);
my_opc.start(startMonior);

function initializePayment(euro, description, tunnelUrl, opc) {

  const paymentData = {
    apiKey: cashfreeConfig.apiKey,
    profileID: cashfreeConfig.profileID,
    amount: euro.toString(),
    clientReference: description,
    successURL: tunnelUrl + "/success",
    failureURL: tunnelUrl + "/fail",
    webhookURL: tunnelUrl + "/webhook"
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
        opc.writeString("ns=1;s=paymentURL", body.paymentURL);
        opc.writeString("ns=1;s=transactionID", body.transactionId);

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
        winston.info('<- verify internetpayments: [%d] [%s]', response.statusCode, error);
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

        apc.writeBoolean("ns=1;s=transactionSigned", true);

        winston.info('-> UAOPC ns=1;s=transactionSigned [TRUE]');

        return;
      }
      else
      {
        winston.info('internetpayments NOTSIGNED: [%s]', transactionID);
      }

      pollPayment(transactionID, opc);
    });

  }, 2000, lpc);
}





