const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
const moment = require("moment");
const cors = require("cors");
const { doc, updateDoc, serverTimestamp } = require("firebase/firestore");
const { db } = require("./firebase");

const app = express();

// Increase the size limit for JSON payloads
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: false, limit: '10mb' }));

// Configure CORS with proper options
const corsOptions = {
  origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Accept', 'Authorization'],
  credentials: true,
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));

// Add middleware to log all requests
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`);
  console.log('Request Headers:', req.headers);
  console.log('Request Body:', req.body);
  
  // Add CORS headers manually for preflight requests
  res.header('Access-Control-Allow-Origin', req.headers.origin);
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Credentials', 'true');
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  next();
});

// Custom response handler
const sendJsonResponse = (res, statusCode, data) => {
  res.status(statusCode).json(data);
};

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Global error handler:', err);
  sendJsonResponse(res, 500, {
    ResponseCode: "1",
    errorMessage: err.message || 'Internal server error'
  });
});

// ACCESS TOKEN FUNCTION
async function getAccessToken() {
  const consumer_key = "frmypHgIJYc7mQuUu5NBvnYc0kF1StP3"; 
  const consumer_secret = "UAeJAJLNUkV5MLpL"; 
  const url = "https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials";

  const auth = "Basic " + Buffer.from(consumer_key + ":" + consumer_secret).toString("base64");

  try {
    console.log('Requesting access token...');
    const response = await axios.get(url, {
      headers: {
        Authorization: auth,
      },
    });
    console.log('Access token response:', response.data);
    const accessToken = response.data.access_token;
    return accessToken;
  } catch (error) {
    console.error('Error getting access token:', {
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      error: error.message
    });
    throw new Error('Failed to get access token: ' + (error.response?.data?.errorMessage || error.message));
  }
}

// Routes
app.get("/", (req, res) => {
  sendJsonResponse(res, 200, { 
    ResponseCode: "0",
    message: "M-Pesa API Server is running" 
  });
});

app.get("/access_token", async (req, res) => {
  try {
    const accessToken = await getAccessToken();
    sendJsonResponse(res, 200, { 
      ResponseCode: "0",
      accessToken 
    });
  } catch (error) {
    console.error('Access token error:', error);
    sendJsonResponse(res, 500, { 
      ResponseCode: "1",
      errorMessage: error.message 
    });
  }
});

app.post("/stkpush", async (req, res) => {
  try {
    console.log("Received STK push request:", req.body);
    
    // Validate required fields
    if (!req.body.phone || !req.body.amount || !req.body.orderId) {
      console.error('Missing required fields:', req.body);
      return sendJsonResponse(res, 400, {
        ResponseCode: "1",
        errorMessage: "Missing required fields. Please provide 'phone', 'amount', and 'orderId'"
      });
    }

    let phoneNumber = req.body.phone;
    const amount = req.body.amount;
    const orderId = req.body.orderId;

    // Format the phone number
    phoneNumber = phoneNumber.toString().trim();
    // Remove leading zeros, plus, or spaces
    phoneNumber = phoneNumber.replace(/^\+|^0+|\s+/g, "");
    // Add country code if not present
    if (!phoneNumber.startsWith("254")) {
      phoneNumber = "254" + phoneNumber;
    }

    // Validate phone number format
    if (!/^254\d{9}$/.test(phoneNumber)) {
      console.error('Invalid phone number format:', phoneNumber);
      return sendJsonResponse(res, 400, {
        ResponseCode: "1",
        errorMessage: "Invalid phone number format. Must be 12 digits starting with 254"
      });
    }

    // Validate amount
    if (isNaN(amount) || amount <= 0) {
      console.error('Invalid amount:', amount);
      return sendJsonResponse(res, 400, {
        ResponseCode: "1",
        errorMessage: "Invalid amount. Must be a positive number"
      });
    }

    const accessToken = await getAccessToken();
    const url = "https://api.safaricom.co.ke/mpesa/stkpush/v1/processrequest";
    const auth = "Bearer " + accessToken;
    const timestampx = moment().format("YYYYMMDDHHmmss");
    const password = Buffer.from(
      "4121151" +
        "68cb945afece7b529b4a0901b2d8b1bb3bd9daa19bfdb48c69bec8dde962a932" +
        timestampx
    ).toString("base64");

    const requestBody = {
      BusinessShortCode: "4121151",
      Password: password,
      Timestamp: timestampx,
      TransactionType: "CustomerPayBillOnline",
      Amount: amount,
      PartyA: phoneNumber,
      PartyB: "4121151",
      PhoneNumber: phoneNumber,
      CallBackURL: `https://luxecarts-mpesa.onrender.com/callback/${orderId}`,
      AccountReference: "LUXECARTS",
      TransactionDesc: "Payment for order",
    };

    console.log('Making STK push request:', {
      url,
      body: requestBody,
      headers: { Authorization: auth }
    });

    try {
      const response = await axios.post(url, requestBody, {
        headers: {
          Authorization: auth,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
      });

      console.log('STK push response:', response.data);
      
      // Ensure the response has the expected format
      if (!response.data.ResponseCode && response.data.ResponseCode !== "0") {
        throw new Error('Invalid response format from M-Pesa API');
      }

      // Send response with proper headers
      res.setHeader('Content-Type', 'application/json');
      res.json({
        ResponseCode: "0",
        ResponseDescription: "Success. Request accepted for processing",
        CheckoutRequestID: response.data.CheckoutRequestID,
        CustomerMessage: response.data.CustomerMessage,
        orderId: orderId
      });
    } catch (mpesaError) {
      console.error('M-Pesa API error:', mpesaError.response?.data || mpesaError);
      return sendJsonResponse(res, 502, {
        ResponseCode: "1",
        errorMessage: mpesaError.response?.data?.errorMessage || 'M-Pesa API request failed'
      });
    }
  } catch (error) {
    console.error('STK push error:', {
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      error: error.message
    });

    // Send error response with proper headers
    res.setHeader('Content-Type', 'application/json');
    res.status(500).json({
      ResponseCode: "1",
      ResponseDescription: error.message || "Failed to initiate payment"
    });
  }
});

// Add callback endpoint to handle M-Pesa callbacks
app.post("/callback/:orderId", async (req, res) => {
  try {
    const { orderId } = req.params;
    const callbackData = req.body;
    
    console.log('Received M-Pesa callback for order:', orderId, callbackData);

    // Check if the payment was successful
    if (callbackData.Body.stkCallback.ResultCode === 0) {
      // Update order status in Firebase
      const orderRef = doc(db, 'orders', orderId);
      await updateDoc(orderRef, {
        paymentStatus: 'completed',
        mpesaResponse: callbackData,
        updatedAt: serverTimestamp()
      });

      console.log('Order updated successfully:', orderId);
    }

    // Always respond with success to M-Pesa
    res.json({
      ResponseCode: "0",
      ResponseDesc: "Success"
    });
  } catch (error) {
    console.error('Callback error:', error);
    // Still send success response to M-Pesa
    res.json({
      ResponseCode: "0",
      ResponseDesc: "Success"
    });
  }
});

app.post("/query", async (req, res) => {
  try {
    console.log("Received query request:", req.body);
    const queryCode = req.body.queryCode;

    if (!queryCode) {
      console.error('Missing queryCode parameter');
      return sendJsonResponse(res, 200, {
        ResponseCode: "1",
        ResultCode: "1",
        ResultDesc: "Missing queryCode parameter",
        errorMessage: "Missing queryCode parameter"
      });
    }

    const accessToken = await getAccessToken();
    const url = "https://api.safaricom.co.ke/mpesa/stkpushquery/v1/query";
    const auth = "Bearer " + accessToken;
    const timestampx = moment().format("YYYYMMDDHHmmss");
    const password = Buffer.from(
      "4121151" +
        "68cb945afece7b529b4a0901b2d8b1bb3bd9daa19bfdb48c69bec8dde962a932" +
        timestampx
    ).toString("base64");

    const requestBody = {
      BusinessShortCode: "4121151",
      Password: password,
      Timestamp: timestampx,
      CheckoutRequestID: queryCode,
    };

    console.log('Making query request:', {
      url,
      body: requestBody,
      headers: { Authorization: auth }
    });

    try {
      const response = await axios.post(url, requestBody, {
        headers: {
          Authorization: auth,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
      });

      console.log('Query response:', response.data);
      
      // Check for successful payment
      if (response.data.ResultCode === "0") {
        // Payment was successful
        return sendJsonResponse(res, 200, {
          ResponseCode: "0",
          ResultCode: "0",
          ResultDesc: "The service request is processed successfully.",
          isSuccessful: true
        });
      }
      
      // Check for specific error codes that indicate cancellation
      if (response.data.ResultCode === "1032") {
        return sendJsonResponse(res, 200, {
          ResponseCode: "3", // Custom code for cancellation
          ResultCode: "1032",
          ResultDesc: "Transaction canceled by user",
          errorMessage: "Transaction was canceled",
          isCanceled: true
        });
      }

      // Handle successful response
      return sendJsonResponse(res, 200, {
        ...response.data,
        ResponseCode: response.data.ResponseCode || "0"
      });
    } catch (mpesaError) {
      console.error('M-Pesa API error response:', mpesaError.response?.data);
      
      // Check for specific error codes
      const errorCode = mpesaError.response?.data?.errorCode;
      const errorMessage = mpesaError.response?.data?.errorMessage;

      // Check if it's a processing status error
      if (errorCode === '500.001.1001') {
        return sendJsonResponse(res, 200, {
          ResponseCode: "2", // Custom code for processing
          ResultCode: "2",
          ResultDesc: "The transaction is being processed",
          errorMessage: errorMessage,
          isProcessing: true
        });
      }

      // Check if it's a cancellation error
      if (errorCode === '500.001.1032') {
        return sendJsonResponse(res, 200, {
          ResponseCode: "3", // Custom code for cancellation
          ResultCode: "1032",
          ResultDesc: "Transaction canceled by user",
          errorMessage: errorMessage,
          isCanceled: true
        });
      }

      // Handle other M-Pesa API errors
      return sendJsonResponse(res, 200, {
        ResponseCode: "1",
        ResultCode: "1",
        ResultDesc: errorMessage || "Failed to check payment status",
        errorMessage: errorMessage || "Payment query failed"
      });
    }
  } catch (error) {
    console.error('Query error:', {
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      error: error.message
    });

    // Return a structured error response
    return sendJsonResponse(res, 200, {
      ResponseCode: "1",
      ResultCode: "1",
      ResultDesc: error.message || "Failed to check payment status",
      errorMessage: error.message || "Payment query failed"
    });
  }
});

const PORT = 8000; // Changed port to 8000
app.listen(PORT, () => {
  console.log(`M-Pesa API Server is running on port ${PORT}`);
});