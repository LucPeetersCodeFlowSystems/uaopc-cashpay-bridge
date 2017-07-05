/* eslint no-console: off , no-process-exit: off*/

require("colors");
const _ = require("underscore");
const assert = require("assert");
const util = require("util");
const blessed = require("blessed");
const chalk = require("chalk");

const Tree = require("./widget_tree").Tree;
const opcua = require("node-opcua");

const version = "01/07/2017";


const NodeClass = require("node-opcua/lib/datamodel/nodeclass").NodeClass;
opcua.NodeClass = NodeClass;
const attributeIdtoString = _.invert(opcua.AttributeIds);
const DataTypeIdsToString = _.invert(opcua.DataTypeIds);
//xx const NodeClassToString = _.invert(opcua.NodeClass);


const argv = require("yargs")
    .wrap(132)

    .demand("endpoint")
    .string("endpoint")
    .describe("endpoint", "the end point to connect to ")

    .string("securityMode")
    .describe("securityMode", "the security mode")

    .string("securityPolicy")
    .describe("securityPolicy", "the policy mode")

    .string("userName")
    .describe("userName", "specify the user name of a UserNameIdentityToken ")

    .string("password")
    .describe("password", "specify the password of a UserNameIdentityToken")

    .string("node")
    .describe("node", "the nodeId of the value to monitor")

    .string("history")
    .describe("history", "make an historical read")

    .boolean("verbose")
    .describe("verbose", "display extra information")

    .alias("e", "endpoint")
    .alias("s", "securityMode")
    .alias("P", "securityPolicy")
    .alias("u", "userName")
    .alias("p", "password")
    .alias("n", "node")
    .alias("t", "timeout")
    .alias("v", "verbose")

    .example("opcua-commander  --endpoint opc.tcp://localhost:49230 -P=Basic256 -s=SIGN")
    .example("opcua-commander  -e opc.tcp://localhost:49230 -P=Basic256 -s=SIGN -u JoeDoe -p P@338@rd ")
    .example("opcua-commander  --endpoint opc.tcp://localhost:49230  -n=\"ns=0;i=2258\"")

    .argv;


const securityMode = opcua.MessageSecurityMode.get(argv.securityMode || "NONE");
if (!securityMode) {
    throw new Error("Invalid Security mode , should be " + opcua.MessageSecurityMode.enums.join(" "));
}

const securityPolicy = opcua.SecurityPolicy.get(argv.securityPolicy || "None");
if (!securityPolicy) {
    throw new Error("Invalid securityPolicy , should be " + opcua.SecurityPolicy.enums.join(" "));
}


const endpointUrl = argv.endpoint || "opc.tcp://localhost:26543";
const yargs = require("yargs");
if (!endpointUrl) {
    yargs.showHelp();
    process.exit(0);
}

const options = {
    securityMode: securityMode,
    securityPolicy: securityPolicy,
    //xx serverCertificate: serverCertificate,
    defaultSecureTokenLifetime: 40000,
    connectionStrategy: {
        maxRetry: 30,
        initialDelay: 1000,
        maxDelay: 10000
    },
    keepSessionAlive: true
};

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

const client = new opcua.OPCUAClient(options);

client.on("send_request", function () {
    data.transactionCount++;
});

client.on("send_chunk", function (chunk) {
    data.sentBytes += chunk.length;
    data.sentChunks++;
});

client.on("receive_chunk", function (chunk) {
    data.receivedBytes += chunk.length;
    data.receivedChunks++;
});

client.on("backoff", function (number, delay) {
    data.backoffCount += 1;
    console.log(chalk.yellow(`backoff  attempt #${number} retrying in ${delay / 1000.0} seconds`));
});

client.on("start_reconnection", function () {
    console.log(chalk.red(" !!!!!!!!!!!!!!!!!!!!!!!!  Starting reconnection !!!!!!!!!!!!!!!!!!! " + endpointUrl));
});

client.on("connection_reestablished", function () {
    console.log(chalk.red(" !!!!!!!!!!!!!!!!!!!!!!!!  CONNECTION RE-ESTABLISHED !!!!!!!!!!!!!!!!!!! " + endpointUrl));
    data.reconnectionCount++;
});

// monitoring des lifetimes
client.on("lifetime_75", function (token) {
    if (argv.verbose) {
        console.log(chalk.red("received lifetime_75 on " + endpointUrl));
    }
});

client.on("security_token_renewed", function () {
    data.tokenRenewalCount += 1;
    if (argv.verbose) {
        console.log(chalk.green(" security_token_renewed on " + endpointUrl));
    }
});


let g_session = null;
let g_subscription = null;

function create_subscription() {
    assert(g_session);
    const parameters = {
        requestedPublishingInterval: 100,
        requestedLifetimeCount: 1000,
        requestedMaxKeepAliveCount: 12,
        maxNotificationsPerPublish: 100,
        publishingEnabled: true,
        priority: 10
    };
    g_subscription = new opcua.ClientSubscription(g_session, parameters);
}

function doDonnect(callback) {
    console.log("connecting to ....", endpointUrl);
    client.connect(endpointUrl, function () {
        console.log("connected to ....", endpointUrl);
        let userIdentity = null; // anonymous
        if (argv.userName && argv.password) {

            userIdentity = {
                userName: argv.userName,
                password: argv.password
            };

        }
        client.createSession(userIdentity, function (err, session) {
            if (!err) {
                g_session = session;
                create_subscription();

                create_monitor_items();
                //populateTree();
            } else {
                console.log(" Cannot create session ", err.toString());
                process.exit(-1);
            }

            //xx callback(err);
        });
    });
}

/**
 *
 * @param callback
 * @param callback.err {Error}
 */
function disconnect(callback) {
    if (!g_session) {
        client.disconnect(function (err) {
            callback(err);
        });
    } else {
        g_session.close(function () {
            client.disconnect(function (err) {
                callback(err);
            });
        });
    }
}

console.log(chalk.green(" Welcome to Cashfree ") + version);
console.log(chalk.cyan("   endpoint url   = "), endpointUrl.toString());
console.log(chalk.cyan("   securityMode   = "), securityMode.toString());
console.log(chalk.cyan("   securityPolicy = "), securityPolicy.toString());

doDonnect(function () {
    debugger;
});


function create_monitor_items() {
    monitor_item('ns=3;s="Communicatie Cashfree"."Startbit"');
}

function monitor_item(nodeId) {

    var lnode = opcua.resolveNodeId(nodeId);

    const monitoredItem = g_subscription.monitor({
        nodeId: lnode,
        attributeId: opcua.AttributeIds.Value
        //, dataEncoding: { namespaceIndex: 0, name:null }
    }, {
            samplingInterval: 1000,
            discardOldest: true,
            queueSize: 100
        });

    monitoredItem.on("changed", function (dataValue) {
        console.log(" value ", dataValue.value);
    });

}
