// var opcua = require("node-opcua");
var opcua = require("../node-opcua-0.3.0/index");
var os = require("os");


// Let create an instance of OPCUAServer
var server = new opcua.OPCUAServer({
    port: 1234,        // the port of the listening socket of the server
    nodeset_filename: opcua.standard_nodeset_file
});

// we can set the buildInfo
server.buildInfo.productName = "MySampleServer1";
server.buildInfo.buildNumber = "7658";
server.buildInfo.buildDate = new Date(2015, 12, 25);


// the server needs to be initialized first. During initialisation,
// the server will construct its default namespace.
server.initialize(function () {

    console.log("initialized");

    // we can now extend the default name space with our variables
    construct_my_address_space(server);

    // we can now start the server
    server.start(function () {
        console.log("Server is now listening ... ( press CTRL+C to stop) ");
        var endpointUrl = server.endpoints[0].endpointDescriptions()[0].endpointUrl;
        server.endpoints[0].endpointDescriptions().forEach(function (endpoint) {
            console.log(endpoint.endpointUrl, endpoint.securityMode.toString(), endpoint.securityPolicyUri.toString());
        });


        // setTimeout(() => {
        //     console.log("server is shutting down....");
        //     server.shutdown(1, () => {
        //           console.log("server shutdown !");
        //     });
        // }, 20000);
    })

    server.on("start", () => {
      console.log("started");
    });
    

});


function construct_my_address_space(server) {

    var addressSpace = server.engine.addressSpace;

    // we create a new folder under RootFolder
    var myDevice = addressSpace.addFolder("ObjectsFolder", { browseName: "NicksMachine" });

    var startBit = false;
    server.nodeVariable2 = addressSpace.addVariable({
        componentOf: myDevice,
        nodeId: "ns=1;s=startBit",
        browseName: "startBit",
        dataType: "Boolean",
        value: {
            get: function () {
                return new opcua.Variant({ dataType: opcua.DataType.Boolean, value: startBit });
            },
            set: function (variant) {
                startBit = variant.value;
                if (startBit == true) {
                    transactionSuccess = false;
                }
                return opcua.StatusCodes.Good;
            }
        }
    });

    var instance = 0;
    server.nodeVariable2 = addressSpace.addVariable({
        componentOf: myDevice,
        nodeId: "ns=1;s=instance",
        browseName: "instance",
        dataType: "Int16",
        value: {
            get: function () {
                return new opcua.Variant({ dataType: opcua.DataType.Int16, value: instance });
            },
            set: function (variant) {
                instance = variant.value;
                transactionSuccess = true;
                return opcua.StatusCodes.Good;
            }
        }
    });


    var cancelBit = false;
    server.nodeVariable2 = addressSpace.addVariable({
        componentOf: myDevice,
        nodeId: "ns=1;s=cancelBit",
        browseName: "cancelBit",
        dataType: "Boolean",
        value: {
            get: function () {
                return new opcua.Variant({ dataType: opcua.DataType.Boolean, value: cancelBit });
            },
            set: function (variant) {
                cancelBit = variant.value;
                if (cancelBit == true) {
                    transactionSuccess = false;
                }
                return opcua.StatusCodes.Good;
            }
        }
    });


    var paymentURL = "";
    server.nodeVariableURL = addressSpace.addVariable({
        componentOf: myDevice,
        nodeId: "ns=1;s=paymentURL",
        browseName: "paymentURL",
        dataType: "String",
        value: {
            get: function () {
                return new opcua.Variant({ dataType: opcua.DataType.String, value: paymentURL });
            },
            set: function (variant) {
                paymentURL = variant.value;
                console.log("paymentURL", paymentURL);
                return opcua.StatusCodes.Good;
            }
        }
    });

    var transactionID = "";
    server.nodeVariable1 = addressSpace.addVariable({
        componentOf: myDevice,
        nodeId: "ns=1;s=transactionID",
        browseName: "transactionID",
        dataType: "String",
        value: {
            get: function () {
                return new opcua.Variant({ dataType: opcua.DataType.String, value: transactionID });
            },
            set: function (variant) {
                transactionID = variant.value;
                console.log("transactionID", transactionID);
                return opcua.StatusCodes.Good;
            }
        }
    });

    var transactionDescription = "";
    server.nodeVariable4 = addressSpace.addVariable({
        componentOf: myDevice,
        nodeId: "ns=1;s=transactionDescription",
        browseName: "transactionDescription",
        dataType: "String",
        value: {
            get: function () {
                return new opcua.Variant({ dataType: opcua.DataType.String, value: transactionDescription });
            },
            set: function (variant) {
                transactionDescription = variant.value;
                return opcua.StatusCodes.Good;
            }
        }
    });

    var transactionAmount = 0.0;
    server.nodeVariable4 = addressSpace.addVariable({
        componentOf: myDevice,
        nodeId: "ns=1;s=transactionAmount",
        browseName: "transactionAmount",
        dataType: "Double",
        value: {
            get: function () {
                return new opcua.Variant({ dataType: opcua.DataType.Double, value: transactionAmount });
            },
            set: function (variant) {
                transactionAmount = variant.value;
                return opcua.StatusCodes.Good;
            }
        }
    });

    var transactionSigned = false;
    server.transactionSigned = addressSpace.addVariable({
        componentOf: myDevice,
        nodeId: "ns=1;s=transactionSigned",
        browseName: "transactionSigned",
        dataType: "Boolean",
        value: {
            get: function () {
                return new opcua.Variant({ dataType: opcua.DataType.Boolean, value: transactionSigned });
            },
            set: function (variant) {
                transactionSigned = variant.value;
                console.log("transactionSigned", transactionSigned);
                return opcua.StatusCodes.Good;
            }
        }
    });

    /// ----- configuration
    var cashfreeConfig = {
        "apiKey": "e310d439-a583-4444-939c-5f5e4a1a458b",
        "profileID": "32ef8dda-3c91-4a66-a631-cbb5d4d976b7",
        "apiLocation": "https://icapps-nodejs-cashfree-api-pre.herokuapp.com/",
    }

    server.cashfreeConfig_apiKey = addressSpace.addVariable({
        componentOf: myDevice,
        nodeId: "ns=1;s=cashfreeConfig_apiKey",
        browseName: "cashfreeConfig apiKey",
        dataType: "String",
        value: {
            get: function () {
                return new opcua.Variant({ dataType: opcua.DataType.String, value: cashfreeConfig.apiKey });
            },
            set: function (variant) {
                cashfreeConfig.apiKey = variant.value;
                return opcua.StatusCodes.Good;
            }
        }
    });

    server.cashfreeConfig_profileID = addressSpace.addVariable({
        componentOf: myDevice,
        nodeId: "ns=1;s=cashfreeConfig_profileID",
        browseName: "cashfreeConfig profileID",
        dataType: "String",
        value: {
            get: function () {
                return new opcua.Variant({ dataType: opcua.DataType.String, value: cashfreeConfig.profileID });
            },
            set: function (variant) {
                cashfreeConfig.profileID = variant.value;
                return opcua.StatusCodes.Good;
            }
        }
    });

    server.cashfreeConfig_apiLocation = addressSpace.addVariable({
        componentOf: myDevice,
        nodeId: "ns=1;s=cashfreeConfig_apiLocation",
        browseName: "cashfreeConfig apiLocation",
        dataType: "String",
        value: {
            get: function () {
                return new opcua.Variant({ dataType: opcua.DataType.String, value: cashfreeConfig.apiLocation });
            },
            set: function (variant) {
                cashfreeConfig.apiLocation = variant.value;
                return opcua.StatusCodes.Good;
            }
        }
    });

    /// ----- hardbeat ping
    var ping = false;
    server.ping = addressSpace.addVariable({
        componentOf: myDevice,
        nodeId: "ns=1;s=Heartbeat",
        browseName: "Heartbeat ping success/failure",
        dataType: "Boolean",
        value: {
            get: function () {
                return new opcua.Variant({ dataType: opcua.DataType.Boolean, value: ping });
            },
            set: function (variant) {
                ping = variant.value;
                return opcua.StatusCodes.Good;
            }
        }
    });




    ///
    // server.nodeVariable2 = addressSpace.addVariable({
    //     componentOf: myDevice,
    //     browseName: "MyVariable2",
    //     dataType: "Double",
    //     value: {
    //         get: function () {
    //             return new opcua.Variant({dataType: opcua.DataType.Double, value: variable2});
    //         },
    //         set: function (variant) {
    //             variable2 = parseFloat(variant.value);
    //             return opcua.StatusCodes.Good;
    //         }
    //     }
    // });


    // server.nodeVariable3 = addressSpace.addVariable({
    //     componentOf: myDevice,
    //     nodeId: "ns=4;b=1020ffab", // some opaque NodeId in namespace 4
    //     browseName: "Percentage Memory Used",
    //     dataType: "Double",
    //     minimumSamplingInterval: 1000,
    //     value: {
    //         get: function () {
    //             // var value = process.memoryUsage().heapUsed / 1000000;
    //             var percentageMemUsed = 1.0 - (os.freemem() / os.totalmem() );
    //             var value = percentageMemUsed * 100;
    //             return new opcua.Variant({dataType: opcua.DataType.Double, value: value});
    //         }
    //     }
    // });

}