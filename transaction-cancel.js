//VB to run -----> node .\start_transaction.js true 1.22 "test met max"

//var opcua = require("node-opcua");
var opcua = require("../node-opcua-0.3.0/index");
var async = require("async");

var client = new opcua.OPCUAClient();
var endpointUrl = "opc.tcp://" + require("os").hostname() + ":1234";
//var endpointUrl = "opc.tcp://192.168.0.50:4840";

var the_session, the_subscription;

// step 1 : connect to
client.connect(endpointUrl, function (err) {
    if (err) {
        return;
    }
    client.createSession(function (err, session) {
        if (err) {
            return;
        }
        the_session = session;

        var nodesToWrite = [
            {
                nodeId: "ns=1;s=cancelBit",
                attributeId: opcua.AttributeIds.Value,
                value: { /* dataValue*/
                    serverTimestamp: new Date(),
                    serverPicoseconds: 20,
                    sourceTimestamp: new Date(),
                    sourcePicoseconds: 30,
                    value: { /* Variant */
                        dataType: opcua.DataType.Boolean,
                        value: false
                    }
                }
            },
            {
                nodeId: "ns=1;s=cancelBit",
                attributeId: opcua.AttributeIds.Value,
                value: { /* dataValue*/
                    serverTimestamp: new Date(),
                    serverPicoseconds: 20,
                    sourceTimestamp: new Date(),
                    sourcePicoseconds: 30,
                    value: { /* Variant */
                        dataType: opcua.DataType.Boolean,
                        value: true
                    }
                }
            }
        ];

        the_session.write(nodesToWrite, function (err, statusCodes) {
            if (!err) {
                  console.log("cancelBit written\n");
            }

            process.exit();
        });
    });
});