const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
const moment = require("moment");
const cors = require("cors");
const https = require('https');
const { doc, updateDoc, serverTimestamp, getDoc } = require("firebase/firestore");
const { db } = require("./firebase");
const { 
  sendOrderConfirmationEmail, 
  sendOrderStatusUpdateEmail, 
  sendOrderCancellationEmail 
} = require('./emailService');

// Add environment variables for email configuration
require('dotenv').config();

const app = express();

// Increase the size limit for JSON payloads
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: false, limit: '10mb' }));

// Get allowed origins from environment variable or use default values
const allowedOrigins = process.env.ALLOWED_ORIGINS ? 
  process.env.ALLOWED_ORIGINS.split(',') : 
  [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'https://luxecarts-pv1l.onrender.com'
  ];

// Configure CORS with proper options
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.log('Blocked by CORS for origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
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
  console.log('Origin:', req.headers.origin);
  
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
      CallBackURL: `${process.env.BASE_URL}/callback/${orderId}`,
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

// Function to send SMS notifications
const sendSMSNotification = async (phoneNumber, message) => {
  try {
    // Format phone number to ensure it starts with 254
    let formattedPhone = phoneNumber.toString().trim();
    formattedPhone = formattedPhone.replace(/^\+|^0+|\s+/g, "");
    if (!formattedPhone.startsWith("254")) {
      formattedPhone = "254" + formattedPhone;
    }

    const data = JSON.stringify({
      apiKey: 'f9e412887a42ff4938baa34971e0b096',
      shortCode: 'VasPro',
      message: message,
      recipient: formattedPhone,
      callbackURL: '',
      enqueue: 1,
      isScheduled: false,
    });

    const options = {
      hostname: 'api.vaspro.co.ke',
      port: 443,
      path: '/v3/BulkSMS/api/create',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length,
      },
    };

    return new Promise((resolve, reject) => {
      const smsReq = https.request(options, (smsRes) => {
        let responseData = '';

        smsRes.on('data', (chunk) => {
          responseData += chunk;
        });

        smsRes.on('end', () => {
          console.log('SMS sent successfully:', responseData);
          resolve(responseData);
        });
      });

      smsReq.on('error', (error) => {
        console.error('Error sending SMS:', error);
        reject(error);
      });

      smsReq.write(data);
      smsReq.end();
    });
  } catch (error) {
    console.error('SMS sending error:', error);
    throw error;
  }
};

// Update the callback endpoint to include SMS notification
app.post("/callback/:orderId", async (req, res) => {
  try {
    const { orderId } = req.params;
    const callbackData = req.body;
    
    console.log('Received M-Pesa callback for order:', orderId, callbackData);

    // Check if the payment was successful
    if (callbackData.Body.stkCallback.ResultCode === 0) {
      // Update order status in Firebase
      const orderRef = doc(db, 'orders', orderId);
      const orderDoc = await getDoc(orderRef);
      
      if (orderDoc.exists()) {
        const orderData = orderDoc.data();
        await updateDoc(orderRef, {
          paymentStatus: 'completed',
          mpesaResponse: callbackData,
          status: 'processing',
          updatedAt: serverTimestamp(),
          isVisible: true
        });

        // Send order confirmation email
        await sendOrderConfirmationEmail(orderData);

        // Send SMS notification
        const message = `Thank you for your order at LuxeCarts! Your order #${orderId.slice(-6)} has been confirmed and is being processed. We'll update you on the status.`;
        await sendSMSNotification(orderData.shippingDetails.phone, message);
      }

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
      BusinessShortCode: "4121151", //change this to the correct Till number 
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

// Update the order status update endpoint to include enhanced notification tracking
app.post("/update-order-status", async (req, res) => {
  try {
    const { orderId, newStatus } = req.body;

    if (!orderId || !newStatus) {
      return res.status(400).json({
        ResponseCode: "1",
        errorMessage: "Order ID and new status are required"
      });
    }

    const orderRef = doc(db, 'orders', orderId);
    const orderDoc = await getDoc(orderRef);

    if (!orderDoc.exists()) {
      return res.status(404).json({
        ResponseCode: "1",
        errorMessage: "Order not found"
      });
    }

    const orderData = orderDoc.data();

    // Check if notification was already sent for this status
    if (orderData.lastNotificationStatus === newStatus && orderData.notificationSent) {
      return res.json({
        ResponseCode: "0",
        message: "Status already updated and notification sent"
      });
    }

    // Update order status
    await updateDoc(orderRef, {
      status: newStatus,
      updatedAt: serverTimestamp()
    });

    try {
      // Send email notification
      await sendOrderStatusUpdateEmail(orderData, newStatus);
      console.log('Status update email sent successfully for order:', orderId);

      // Send SMS notification based on status
      let message = '';
      switch (newStatus) {
        case 'processing':
          message = `Your LuxeCarts order #${orderId.slice(-6)} is being processed. We'll notify you when it ships.`;
          break;
        case 'shipped':
          message = `Great news! Your LuxeCarts order #${orderId.slice(-6)} has been shipped and is on its way.`;
          break;
        case 'delivered':
          message = `Your LuxeCarts order #${orderId.slice(-6)} has been delivered. Thank you for shopping with us!`;
          break;
        default:
          message = `Your LuxeCarts order #${orderId.slice(-6)} status has been updated to: ${newStatus}`;
      }
      
      await sendSMSNotification(orderData.shippingDetails.phone, message);
      console.log('Status update SMS sent successfully for order:', orderId);

      // Update notification tracking
      await updateDoc(orderRef, {
        notificationSent: true,
        lastNotificationStatus: newStatus,
        lastNotificationTime: serverTimestamp(),
        notificationHistory: [...(orderData.notificationHistory || []), {
          type: 'status_update',
          status: newStatus,
          emailSent: true,
          smsSent: true,
          timestamp: serverTimestamp()
        }]
      });

      res.json({
        ResponseCode: "0",
        message: "Order status updated and notifications sent successfully"
      });
    } catch (notificationError) {
      console.error('Error sending notifications:', notificationError);
      
      // Update notification tracking with error
      await updateDoc(orderRef, {
        notificationSent: false,
        notificationError: notificationError.message,
        notificationHistory: [...(orderData.notificationHistory || []), {
          type: 'status_update',
          status: newStatus,
          error: notificationError.message,
          timestamp: serverTimestamp()
        }]
      });

      throw notificationError;
    }
  } catch (error) {
    console.error('Error updating order status:', error);
    res.status(500).json({
      ResponseCode: "1",
      errorMessage: error.message || "Failed to update order status"
    });
  }
});

// Update the order cancellation endpoint to include SMS
app.post("/cancel-order", async (req, res) => {
  try {
    const { orderId } = req.body;

    if (!orderId) {
      return res.status(400).json({
        ResponseCode: "1",
        errorMessage: "Order ID is required"
      });
    }

    const orderRef = doc(db, 'orders', orderId);
    const orderDoc = await getDoc(orderRef);

    if (!orderDoc.exists()) {
      return res.status(404).json({
        ResponseCode: "1",
        errorMessage: "Order not found"
      });
    }

    const orderData = orderDoc.data();
    await updateDoc(orderRef, {
      status: 'cancelled',
      updatedAt: serverTimestamp()
    });

    // Send cancellation email
    await sendOrderCancellationEmail(orderData);

    // Send SMS notification
    const message = `Your LuxeCarts order #${orderId.slice(-6)} has been cancelled. Any payment made will be refunded within 5-7 business days.`;
    await sendSMSNotification(orderData.shippingDetails.phone, message);

    res.json({
      ResponseCode: "0",
      message: "Order cancelled successfully"
    });
  } catch (error) {
    console.error('Error cancelling order:', error);
    res.status(500).json({
      ResponseCode: "1",
      errorMessage: error.message || "Failed to cancel order"
    });
  }
});

const PORT = 8000; // Changed port to 8000
// B2C Payment Route - For sending money to farmers/vendors
app.post("/b2c-payment", async (req, res) => {
  try {
    console.log("Received B2C payment request:", req.body);
    
    // Validate required fields
    if (!req.body.phone || !req.body.amount) {
      console.error('Missing required fields:', req.body);
      return sendJsonResponse(res, 400, {
        ResponseCode: "1",
        errorMessage: "Missing required fields. Please provide 'phone' and 'amount'"
      });
    }

    let phoneNumber = req.body.phone;
    const amount = req.body.amount;
    const remarks = req.body.remarks || "Payout for product sales";
    const occasion = req.body.occasion || "Vendor payout";

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
    const url = "https://api.safaricom.co.ke/mpesa/b2c/v1/paymentrequest";
    const auth = "Bearer " + accessToken;
    
    // B2C request body
    const requestBody = {
      "InitiatorName": process.env.MPESA_INITIATOR_NAME || "testapi",
      "SecurityCredential": process.env.MPESA_SECURITY_CREDENTIAL || "your-security-credential", // This should be properly generated
      "CommandID": "BusinessPayment", // Use "BusinessPayment" for business transactions
      "Amount": amount,
      "PartyA": "4121151", // Your organization's shortcode
      "PartyB": phoneNumber,
      "Remarks": remarks,
      "QueueTimeOutURL": `${process.env.BASE_URL}/b2c-timeout`,
      "ResultURL": `${process.env.BASE_URL}/b2c-result`,
      "Occasion": occasion
    };

    console.log('Making B2C payment request:', {
      url,
      body: requestBody,
      headers: { Authorization: auth }
    });

    try {
      const response = await axios.post(url, requestBody, {
        headers: {
          Authorization: auth,
          'Content-Type': 'application/json'
        },
      });

      console.log('B2C payment response:', response.data);
      
      // Send success response
      res.json({
        ResponseCode: "0",
        ResponseDescription: "Success. Request accepted for processing",
        OriginatorConversationID: response.data.OriginatorConversationID,
        ConversationID: response.data.ConversationID,
        TransactionID: response.data.ResponseDescription
      });
    } catch (mpesaError) {
      console.error('M-Pesa B2C API error:', mpesaError.response?.data || mpesaError);
      return sendJsonResponse(res, 502, {
        ResponseCode: "1",
        errorMessage: mpesaError.response?.data?.errorMessage || 'M-Pesa B2C API request failed'
      });
    }
  } catch (error) {
    console.error('B2C payment error:', {
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      error: error.message
    });

    // Send error response
    res.status(500).json({
      ResponseCode: "1",
      ResponseDescription: error.message || "Failed to initiate B2C payment"
    });
  }
});

// B2C Result URL
app.post("/b2c-result", async (req, res) => {
  try {
    console.log('Received B2C result callback:', req.body);
    
    // Extract the necessary information from the callback
    const resultData = req.body.Result;
    
    // Check if the transaction was successful
    if (resultData.ResultCode === 0) {
      // Transaction was successful
      const transactionId = resultData.TransactionID;
      const amount = resultData.TransactionAmount;
      const phoneNumber = resultData.ReceiverPartyPublicName.split(' - ')[0];
      
      console.log(`B2C payment of KES ${amount} to ${phoneNumber} was successful. Transaction ID: ${transactionId}`);
      
      // Here you can update your database or perform any other necessary actions
      // For example, update the payout status for a vendor
      
      // Send SMS notification to the recipient
      const message = `You have received KES ${amount} from LuxeCarts as payment for your product sales. Transaction ID: ${transactionId}`;
      try {
        await sendSMSNotification(phoneNumber, message);
        console.log('B2C payment notification SMS sent successfully');
      } catch (smsError) {
        console.error('Failed to send B2C payment notification SMS:', smsError);
      }
    } else {
      // Transaction failed
      console.error('B2C payment failed:', resultData);
    }
    
    // Always respond with success to M-Pesa
    res.json({
      ResponseCode: "0",
      ResponseDesc: "Success"
    });
  } catch (error) {
    console.error('B2C result callback error:', error);
    // Still send success response to M-Pesa
    res.json({
      ResponseCode: "0",
      ResponseDesc: "Success"
    });
  }
});

// B2C Timeout URL
app.post("/b2c-timeout", async (req, res) => {
  try {
    console.log('Received B2C timeout callback:', req.body);
    
    // Always respond with success to M-Pesa
    res.json({
      ResponseCode: "0",
      ResponseDesc: "Success"
    });
  } catch (error) {
    console.error('B2C timeout callback error:', error);
    // Still send success response to M-Pesa
    res.json({
      ResponseCode: "0",
      ResponseDesc: "Success"
    });
  }
});

app.listen(PORT, () => {
  console.log(`M-Pesa API Server is running on port ${PORT}`);
});