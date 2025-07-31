# Environment Variables for M-Pesa Integration

This file provides guidance on setting up the required environment variables for the M-Pesa integration.

## Required Environment Variables

Create a `.env` file in the root directory with the following variables:

```
# M-Pesa API Configuration
BASE_URL=http://your-domain.com
ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000,https://your-domain.com

# M-Pesa B2C API Configuration
MPESA_INITIATOR_NAME=testapi
MPESA_SECURITY_CREDENTIAL=your-security-credential

# Email Configuration
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-email-password
```

## Variable Descriptions

### M-Pesa API Configuration

- `BASE_URL`: The base URL of your server, used for callback URLs
- `ALLOWED_ORIGINS`: Comma-separated list of allowed origins for CORS

### M-Pesa B2C API Configuration

- `MPESA_INITIATOR_NAME`: The initiator name provided by Safaricom for B2C transactions
- `MPESA_SECURITY_CREDENTIAL`: The security credential for B2C transactions

### Email Configuration

- `EMAIL_USER`: Email address used for sending notifications
- `EMAIL_PASS`: Password or app-specific password for the email account

## Security Credential Generation

For B2C transactions, you need to generate a security credential:

1. Get the production certificate from the Safaricom Developer Portal
2. Use OpenSSL to generate the security credential:

```bash
openssl base64 -in cert.cer -out cert.base64
```

3. Use the generated base64 string as your `MPESA_SECURITY_CREDENTIAL`