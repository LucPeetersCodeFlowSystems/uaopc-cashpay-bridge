
/*
  "sharedio":
    {
        "startbit": "ns=1;s=startBit", // MONITOR/READ/WRITE: start a transaction
        "instance": "ns=1;s=instance", // READ: instancenumber of the vending machine that started the transaction
        "heartbeat": "ns=1;s=Heartbeat" // WRITE: heartbeat set to true or false
    },
    "ios": [
        {
            "cancelBit": "ns=1;s=cancelBit", // READ: cancel a transaction that is in a polling state
            "transactionAmount": "ns=1;s=transactionAmount", // READ: the amount
            "transactionDescription": "ns=1;s=transactionDescription", // READ: the desciption of the transaction
            "cashfreeConfig_apiKey": "ns=1;s=cashfreeConfig_apiKey", // READ: the api key
            "cashfreeConfig_profileID": "ns=1;s=cashfreeConfig_profileID", // READ: the profile ID
            "cashfreeConfig_apiLocation": "ns=1;s=cashfreeConfig_apiLocation", // READ: the api URL
            "transactionpoll": "ns=1;s=transactionPollCounter", // WRITE: counter that indicates number of polls
            "paymentURL": "ns=1;s=paymentURL", //  WRITE: payment URL, to be shown on the display
            "transactionID": "ns=1;s=transactionID", // WRITE: the id a the transaction
            "transactionSigned": "ns=1;s=transactionSigned" // WRITE: if the transaction is SIGNED
        }
    ]
*/