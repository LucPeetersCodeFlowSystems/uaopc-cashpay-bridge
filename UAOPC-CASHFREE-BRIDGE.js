// DEVELOPMENT: start the simulation OPC server if needed: node .\server.js
// DEVELOPMENT: simulate a transaction: node .\start_transaction.js true 2.10 "Koffie"
// DEVELOPMENT: start the OPC monitor: opcua-commander -e opc.tcp://ULTRABOOK-LUC:1234
// DEVELOPMENT/PROD: start this OPC <-> PC <-> CASHFREE bridge: node .\opcCashFreeBridge.js

// http://node-opcua.github.io/api_doc/classes/OPCUAClient.html

//const opcua = require("node-opcua");
const opcua = require("../node-opcua-0.3.0/index");


const assert = require('assert');
const request = require('request-promise');
const open = require('opn');
const bodyParser = require('body-parser');
const opc = require("./opc");
const winston = require('winston');
const normalize = require('normalize-path');
var fs = require('fs');

winston.configure({
  transports: [
    new winston.transports.File({ filename: 'cashfree-bridge.log' }),
    new winston.transports.Console()
  ]
});

//require('winston-mongodb');

process.on('unhandledRejection', (reason, p) => {
  winston.error('Unhandled Rejection at: Promise', p, 'reason:', reason);
  // application specific logging, throwing an error, or other logic here
});

const argv = require("yargs")
  .wrap(132)

  //.demand("config")
  .string("config")
  .describe("config", "the json file")

  .string("debug")
  .describe("debug", "set to debugging output")


  .alias("c", "config")
  .alias("d", "debug")

  .example("node UAOPC-CASHFREE-BRIDGE ")
  .example("node UAOPC-CASHFREE-BRIDGE -c UAOPC-CASHFREE-BRIDGE-LOCAL.json")
  .argv;

if (argv.debug === "true") {
  winston.level = 'debug';
}

const configPath = argv.config || "./UAOPC-CASHFREE-BRIDGE.json";
const nconfigPath = normalize(configPath)
if (!fs.existsSync(nconfigPath)) {
  winston.error("Config file does not exists", argv.config)
}

const global_config = require(nconfigPath);

if (global_config.qrcode !== undefined) {
  var qrcode = require('qrcode-terminal');
  qrcode.generate(global_config.qrcode);
}

winston.info('starting...');

var gDB = null;

class boot {

  static async load() {
    const dbconnection = await this.dbconnect();
    const opcconnection = await this.opcconnect();

    return;
  }

  static async dbconnect() {
    return new Promise((resolve, reject) => {
      var MongoClient = require('mongodb').MongoClient;
      var url = "mongodb://localhost:27017/cashfreedb";

      // https://www.w3schools.com/nodejs/nodejs_mongodb_create_db.asp
      MongoClient.connect(url, function (err, db) {
        if (err) {
          winston.warn("could not connect to database", url, err.message);
        }
        else {
          winston.info("connected to mongodb service:", url);
        }

        gDB = db;
        gDB = null;
        //winston.add(winston.transports.MongoDB, { db: db });

        resolve(db);
      });
    });
  }

  static async opcconnect() {
    const l_opcconnection = new opc(global_config.opcserver);
    const w = await l_opcconnection.initialize();

    //fnHeartbeat();




    l_opcconnection.monitor(global_config.sharedio.startbit, function (value) {
      if (value.value.value == true) {
        var rt = new RunningTransaction(l_opcconnection);
        rt.start();
      }
      else {
        winston.info("Waiting for startbit on", global_config.sharedio.startbit);
      }
    });

    // --- some test code
    let sim = new Heartbeat(l_opcconnection, 0);
    sim.start();

  }

};

class RunningTransaction {

  constructor(opc) {

    this.opc = opc;

    this.instance_config = null;
    this.instance = null;

    this.apiKey = "";
    this.profileID = "";
    this.apiLocation = "";
    this.cancelBit = false;

    this.amount = 0.0;
    this.description = "";
  }

  async start() {

    try {

      winston.info("RunningTransaction::start");

      // write start bit to false
      await this.opc.writeAsync(global_config.sharedio.startbit, false);
      //await this.opc.writeAsync(global_config.sharedio.paymentBusy, true);

      // read instance 
      this.instance = await this.opc.readAsync(global_config.sharedio.instance);
      if (this.instance == null) this.instance = 0;

      // get config based upon instance 
      this.instance_config = global_config.ios[this.instance];

      winston.info("RunningTransaction::start instance: ", this.instance);
      winston.debug("RunningTransaction::start config: ", this.instance_config);

      var rtn = await this.opc.writeAsync(this.instance_config.errorCode, "");
      var rtn = await this.opc.writeAsync(this.instance_config.errorDescription, "");
      var rtn = await this.opc.writeAsync(this.instance_config.paymentURL, "");
      var rtn = await this.opc.writeAsync(this.instance_config.transactionID, "");
      var rtn = await this.opc.writeAsync(this.instance_config.transactionSigned, false);
      var rtn = await this.opc.writeAsync(this.instance_config.cancelBit, false);


      this.apiKey = await this.opc.readAsync(this.instance_config.cashfreeConfig_apiKey);
      this.profileID = await this.opc.readAsync(this.instance_config.cashfreeConfig_profileID);
      this.apiLocation = await this.opc.readAsync(this.instance_config.cashfreeConfig_apiLocation);

      this.amount = await this.opc.readAsync(this.instance_config.transactionAmount);
      this.description = await this.opc.readAsync(this.instance_config.transactionDescription);

      var paymentdata = this.paymentData;

      winston.info("RunningTransaction[%d]::requestPayment:", this.instance, paymentdata);

      // --- request transaction
      this.response = await this.requestPayment(paymentdata);
      if (this.response.error) {

        var code = this.response.error.errors[0].code.toString();
        var description = this.response.error.errors[0].message;
        var detail = this.response.error.errors[0].detail[0];

        winston.error("RunningTransaction[%d]::requestPayment:", this.instance, code, description, detail);

        var rtn = await this.opc.writeAsync(this.instance_config.errorCode, code);
        var rtn = await this.opc.writeAsync(this.instance_config.errorDescription, description + ": " + detail);
        var rtn = await this.opc.writeAsync(this.instance_config.cancelBit, true);

        return;
      }

      this.response.paymentURL += global_config.cashfree.apiSuffix;

      // --- insert to database
      if (gDB) gDB.collection("transaction").insert(
        {
          transactionId: this.response.transactionId,
          transactionRequest: paymentdata,
          transactionResponse: this.response,
          responseCheckPaymentStatus: null,
          cancelBit: null,
          dt_create: Date()
        });

      var rtn = await this.opc.writeAsync(this.instance_config.transactionID, this.response.transactionId);
      var rtn = await this.opc.writeAsync(this.instance_config.paymentURL, this.response.paymentURL);

      winston.info("RunningTransaction[%d]::transactionID:", this.instance, this.response.transactionId);

      // the url is put on the PLC screen

      if (global_config.openbrowser === true) {
        // the url is put on the PC screen is simulation is on
        open(this.response.paymentURL);
      }

      var myquery = { transactionId: this.response.transactionId };


      // -----------------------------------------------------------------------
      // --- BEGIN LOOP ------ CHECK PAYMENT -----------------------------------
      // -----------------------------------------------------------------------
      var paymentChecks = 0;
      do {
        await this.delay(2000);

        paymentChecks++;

        // -- check if transaction is signed
        this.responseCheckPaymentStatus = await this.requestCheckPaymentStatus(this.response.transactionId);
        if (this.responseCheckPaymentStatus.error) {

          var code = this.responseCheckPaymentStatus.error.errors[0].code.toString();
          var description = this.responseCheckPaymentStatus.error.errors[0].message;

          winston.error("RunningTransaction[%d]::requestCheckPaymentStatus-%d:", this.instance, paymentChecks, this.response.transactionId, code, description);

          var rtn = await this.opc.writeAsync(this.instance_config.errorCode, code);
          var rtn = await this.opc.writeAsync(this.instance_config.errorDescription, description);
          var rtn = await this.opc.writeAsync(this.instance_config.cancelBit, true);

          var rtn = await this.requestCancelPayment(this.response.transactionId);

          break;
        }

        winston.info("RunningTransaction[%d]::requestCheckPaymentStatus-%d:", this.instance, paymentChecks, this.response.transactionId);

        this.cancelBit = await this.opc.readAsync(this.instance_config.cancelBit);

        // -- check if payment is cancelled
        if (paymentChecks >= 30 && this.cancelBit === true) {
          await this.requestCancelPayment(this.response.transactionId);
        }

        // if payment is signed or canceled break the while
        if (this.responseCheckPaymentStatus.signed === true) {
          break;
        }

      } while (true)
      // --- END LOOP ------ CHECK PAYMENT -----------------------------------

      // ---------- SIGNED TRANSACTION
      if (this.responseCheckPaymentStatus.signed === true) {

        winston.info("RunningTransaction[%d]::requestCheckPaymentStatus-%d SIGNED:", this.instance, paymentChecks, this.response.transactionId);
        
        // update plc, transaction is signed
        var paymentToOPC = await this.opc.writeAsync(this.instance_config.transactionSigned, true);
        if (paymentToOPC === false) {
          // ERROR TO PLC, NOW WHA
          if (gDB) gDB.collection("failed").insert({
            responseCheckPaymentStatus: this.responseCheckPaymentStatus,
            dt_create: Date()
          });
        }
        else {
          winston.info("RunningTransaction::transactionSigned written.");
        }
      }

    }
    catch (ex) {
      winston.error("RunningTransaction::start exception: ", ex);
    }

    return;
  }

  async requestPayment(paymentdata) {
    return new Promise((resolve, reject) => {

      const url = this.apiLocation + 'api/internetpayments/';
      // --- request transaction
      winston.debug('RunningTransaction::requestPayment', url, JSON.stringify(this.paymentData));

      request({
        url: url,
        method: "POST",
        json: true,
        headers: {
          "content-type": "application/json",
        },
        body: paymentdata
      })
        .then(function (data) {
          winston.debug('RunningTransaction::requestPayment OK', JSON.stringify(data));
          resolve(data);
        })
        .catch(function (data) {
          winston.error('RunningTransaction::requestPayment NOK', data.statusCode);
          resolve(data);
        });
    });
  }

  async requestCheckPaymentStatus(transactionId) {
    return new Promise((resolve, reject) => {

      var url = this.apiLocation + 'api/internetpayments/' + transactionId;

      request({
        url: url,
        method: "GET",
        json: true,
        headers: {
          "content-type": "application/json",
        }
      })
        .then(function (data) {
          winston.debug('RunningTransaction::requestCheckPaymentStatus OK', JSON.stringify(data));
          resolve(data);
        })
        .catch(function (error) {
          winston.error('RunningTransaction::requestCheckPaymentStatus NOK', error.statusCode);
          resolve(error);
        });
    });
  }

  //requestCancelPayment

  async requestCancelPayment(transactionId) {
    return new Promise((resolve, reject) => {

      var url = this.apiLocation + 'api/internetpayments/' + transactionId;

      request({
        url: url,
        method: "DELETE",
        json: true,
        headers: {
          "content-type": "application/json",
        },
        body: {
          apiKey: this.apiKey,
          profileID: this.profileID,
        }
      })
        .then(function (data) {
          winston.info('RunningTransaction::requestCancelPayment OK', url, JSON.stringify(data));
          resolve(data);
        })
        .catch(function (error) {
          winston.error('RunningTransaction::requestCancelPayment NOK', error.statusCode);
          resolve(error);
        });
    });
  }


  get paymentData() {
    return {
      apiKey: this.apiKey,
      profileID: this.profileID,
      amount: this.amount.toString(),
      clientReference: this.description,
      successURL: "http://www.coinmonster.be",
      failureURL: "/fail",
      webhookURL: "/webhook"
    };
  }

  async delay(timeout) {
    return new Promise((resolve, reject) => {
      setTimeout(() => resolve(), timeout);
    });
  }

}

class Heartbeat {

  constructor(opc, instance) {
    this.opc = opc;
    this.instance = instance;
    this.heartbeat = false;
  }

  async start() {

    do {

      // var startbit = await this.opc.readAsync(global_config.sharedio.startbit);
      // if (startbit === false) {
      //   await this.opc.writeAsync(global_config.ios[this.instance].transactionAmount, 0.5);
      //   await this.opc.writeAsync(global_config.ios[this.instance].transactionDescription, "ALFA TESTING");

      //   await this.opc.writeAsync(global_config.sharedio.instance, this.instance);
      //   await this.opc.writeAsync(global_config.sharedio.startbit, true);
      // }

      this.heartbeat = !this.heartbeat;

      var rtn = await this.opc.writeAsync(global_config.sharedio.heartbeat, this.heartbeat);
      winston.debug("Heartbeat loop.", rtn);

      await this.delay(1000);

    } while (true);
  }

  async delay(timeout) {
    return new Promise((resolve, reject) => {
      setTimeout(() => resolve(), timeout);
    });
  }

}


boot.load();
winston.log("loading...");