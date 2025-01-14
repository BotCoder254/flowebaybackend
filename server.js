const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
const moment = require("moment");
const cors = require("cors");

const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cors());

// Add middleware to log all requests
app.use((req, res, next) => {
  console.log('Request Headers:', req.headers);
  console.log('Content-Type:', req.headers['content-type']);
  next();
});

// ACCESS TOKEN FUNCTION
async function getAccessToken() {
  const consumer_key = "frmypHgIJYc7mQuUu5NBvnYc0kF1StP3"; 
  const consumer_secret = "UAeJAJLNUkV5MLpL"; 
  const url = "https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials";

  const auth = "Basic " + Buffer.from(consumer_key + ":" + consumer_secret).toString("base64");

  try {
    const response = await axios.get(url, {
      headers: {
        Authorization: auth,
      },
    });
    const accessToken = response.data.access_token;
    return accessToken;
  } catch (error) {
    throw error;
  }
}

// Routes
app.get("/", (req, res) => {
  res.send("HELLO WORLD");
  var timeStamp = moment().format("YYYYMMDDHHmmss");
  console.log(timeStamp);
});

app.get("/access_token", (req, res) => {
  getAccessToken()
    .then((accessToken) => {
      res.send("Your access token is " + accessToken);
    })
    .catch(console.log);
});

app.post("/stkpush", (req, res) => {
  // Debug log to see what's being received
  console.log("Received request body:", req.body);
  
  // Validate required fields
  if (!req.body.phone || !req.body.amount) {
    return res.status(400).json({
      error: "Missing required fields. Please provide both 'phone' and 'amount'"
    });
  }

  let phoneNumber = req.body.phone;
  const amount = req.body.amount;

  // Format the phone number
  phoneNumber = phoneNumber.toString().trim();
  // Remove leading zeros, plus, or spaces
  phoneNumber = phoneNumber.replace(/^\+|^0+|\s+/g, "");
  // Add country code if not present
  if (!phoneNumber.startsWith("254")) {
    phoneNumber = "254" + phoneNumber;
  }

  getAccessToken()
    .then((accessToken) => {
      const url = "https://api.safaricom.co.ke/mpesa/stkpush/v1/processrequest";
      const auth = "Bearer " + accessToken;
      const timestampx = moment().format("YYYYMMDDHHmmss");
      const password = Buffer.from(
        "4121151" +
          "68cb945afece7b529b4a0901b2d8b1bb3bd9daa19bfdb48c69bec8dde962a932" +
          timestampx
      ).toString("base64");

      axios
        .post(
          url,
          {
            BusinessShortCode: "4121151",
            Password: password,
            Timestamp: timestampx,
            TransactionType: "CustomerPayBillOnline",
            Amount: amount,
            PartyA: phoneNumber,
            PartyB: "4121151",
            PhoneNumber: phoneNumber,
            CallBackURL: "https://github.com/BotCoder254",
            AccountReference: "KIOTA",
            TransactionDesc: "Mpesa Daraja API stk push test",
          },
          {
            headers: {
              Authorization: auth,
            },
          }
        )
        .then((response) => {
          res.send(response.data);
        })
        .catch((error) => {
          console.log(error);
          res.status(500).send("Request failed");
        });
    })
    .catch(console.log);
});

app.post("/query", (req, res) => {
  const queryCode = req.body.queryCode;

  getAccessToken()
    .then((accessToken) => {
      const url = "https://api.safaricom.co.ke/mpesa/stkpushquery/v1/query";
      const auth = "Bearer " + accessToken;
      const timestampx = moment().format("YYYYMMDDHHmmss");
      const password = Buffer.from(
        "4121151" +
          "68cb945afece7b529b4a0901b2d8b1bb3bd9daa19bfdb48c69bec8dde962a932" +
          timestampx
      ).toString("base64");

      axios
        .post(
          url,
          {
            BusinessShortCode: "4121151",
            Password: password,
            Timestamp: moment().format("YYYYMMDDHHmmss"),
            CheckoutRequestID: queryCode,
          },
          {
            headers: {
              Authorization: auth,
            },
          }
        )
        .then((response) => {
          res.send(response.data);
        })
        .catch((error) => {
          console.log(error);
          res.status(500).send("Request failed");
        });
    })
    .catch(console.log);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});