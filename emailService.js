const nodemailer = require('nodemailer');
const path = require('path');
const nodemailerHbs = require('nodemailer-express-handlebars');

// Create a transporter using Gmail SMTP
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER, // Add your Gmail email
    pass: process.env.EMAIL_PASS  // Add your Gmail app password
  }
});

// Configure handlebars
const handlebarOptions = {
  viewEngine: {
    extName: '.handlebars',
    partialsDir: path.resolve('./views/emails/'),
    defaultLayout: false,
  },
  viewPath: path.resolve('./views/emails/'),
  extName: '.handlebars',
};

// Use handlebars with nodemailer
transporter.use('compile', nodemailerHbs(handlebarOptions));

const sendOrderConfirmationEmail = async (orderDetails) => {
  try {
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: orderDetails.shippingDetails.email,
      subject: 'Order Confirmation - LuxeCarts',
      template: 'orderConfirmation',
      context: {
        orderNumber: orderDetails.id,
        customerName: orderDetails.shippingDetails.name,
        items: orderDetails.items,
        total: orderDetails.total,
        shippingAddress: `${orderDetails.shippingDetails.address}, ${orderDetails.shippingDetails.city}, ${orderDetails.shippingDetails.state}, ${orderDetails.shippingDetails.zipCode}`,
        orderDate: new Date().toLocaleDateString()
      }
    };

    await transporter.sendMail(mailOptions);
    console.log('Order confirmation email sent successfully');
  } catch (error) {
    console.error('Error sending order confirmation email:', error);
  }
};

const sendOrderStatusUpdateEmail = async (orderDetails, newStatus) => {
  try {
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: orderDetails.shippingDetails.email,
      subject: `Order Status Update - LuxeCarts`,
      template: 'orderStatusUpdate',
      context: {
        orderNumber: orderDetails.id,
        customerName: orderDetails.shippingDetails.name,
        newStatus: newStatus,
        orderDate: new Date().toLocaleDateString()
      }
    };

    await transporter.sendMail(mailOptions);
    console.log('Order status update email sent successfully');
  } catch (error) {
    console.error('Error sending order status update email:', error);
  }
};

const sendOrderCancellationEmail = async (orderDetails) => {
  try {
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: orderDetails.shippingDetails.email,
      subject: 'Order Cancellation - LuxeCarts',
      template: 'orderCancellation',
      context: {
        orderNumber: orderDetails.id,
        customerName: orderDetails.shippingDetails.name,
        orderDate: new Date().toLocaleDateString(),
        cancellationDate: new Date().toLocaleDateString()
      }
    };

    await transporter.sendMail(mailOptions);
    console.log('Order cancellation email sent successfully');
  } catch (error) {
    console.error('Error sending order cancellation email:', error);
  }
};

module.exports = {
  sendOrderConfirmationEmail,
  sendOrderStatusUpdateEmail,
  sendOrderCancellationEmail
}; 