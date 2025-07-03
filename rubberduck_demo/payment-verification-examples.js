/*
 * Rubberduck Demo - Payment Verification Examples
 * This file contains examples of how to use the payment verification
 * microservices in different scenarios in Juice Shop.
 */

// Import the integration module
const PaymentVerificationIntegration = require('./payment-verification-integration');

// Example 1: Basic verification of a payment
async function verifyPaymentExample(transactionId, orderId) {
  const integration = new PaymentVerificationIntegration();
  
  console.log(`Verifying payment for transaction ${transactionId}, order ${orderId}...`);
  
  const result = await integration.verifyTransaction(transactionId, orderId);
  
  if (result.success) {
    console.log('Verification successful!');
    console.log('Verification ID:', result.verificationId);
    console.log('Status:', result.data.status);
    console.log('Result:', result.data.result);
    
    if (result.data.issues && result.data.issues.length > 0) {
      console.log('Issues found:');
      result.data.issues.forEach(issue => {
        console.log(`- ${issue}`);
      });
    }
  } else {
    console.error('Verification failed:', result.error);
  }
  
  return result;
}

// Example 2: Process a payment and verify it in one step
async function processAndVerifyPaymentExample(orderData) {
  const integration = new PaymentVerificationIntegration();
  
  console.log(`Processing and verifying payment for order ${orderData.orderId}...`);
  
  const paymentData = {
    amount: orderData.totalPrice,
    currency: 'USD',
    paymentMethod: orderData.paymentMethod,
    userId: orderData.userId,
    orderId: orderData.orderId,
    paymentDetails: orderData.paymentDetails
  };
  
  const result = await integration.processAndVerifyPayment(paymentData);
  
  if (result.success) {
    console.log('Payment processed and verified successfully!');
    console.log('Transaction ID:', result.transactionId);
    console.log('Verification ID:', result.verificationId);
  } else {
    console.error('Payment or verification failed:', result.error);
    console.log('Failed in stage:', result.stage);
    
    if (result.payment && !result.payment.success) {
      console.log('Payment error:', result.payment.error);
    }
    
    if (result.verification && !result.verification.success) {
      console.log('Verification error:', result.verification.error);
    }
  }
  
  return result;
}

// Example 3: Verify if an order has been paid
async function verifyOrderPaymentExample(orderId) {
  const integration = new PaymentVerificationIntegration();
  
  console.log(`Checking payment status for order ${orderId}...`);
  
  const result = await integration.verifyOrderPayment(orderId);
  
  if (result.success) {
    if (result.verified) {
      console.log('Order has been paid successfully!');
      
      if (result.data.transactions && result.data.transactions.length > 0) {
        console.log('Transactions:');
        result.data.transactions.forEach(tx => {
          console.log(`- ID: ${tx.transactionId}, Status: ${tx.status}, Amount: ${tx.amount} ${tx.currency}`);
        });
      }
    } else {
      console.log('Order has not been paid or payment verification failed.');
      console.log('Reason:', result.message);
    }
  } else {
    console.error('Error checking order payment:', result.error);
  }
  
  return result;
}

// Example 4: Using event listeners for real-time payment verification
function setupPaymentVerificationListeners() {
  const integration = new PaymentVerificationIntegration({
    autoVerify: true // Automatically verify payments
  });
  
  // Listen for successful verifications
  integration.on('payment_auto_verified', (data) => {
    console.log(`Payment for order ${data.orderId} automatically verified!`);
    // Here you could update the order status to 'paid_verified'
    updateOrderStatus(data.orderId, 'paid_verified');
  });
  
  // Listen for verification failures
  integration.on('payment_auto_verification_failed', (data) => {
    console.error(`Payment verification failed for order ${data.orderId}`);
    console.log('Issues:', data.issues);
    
    // Here you could flag the order for manual review
    flagOrderForReview(data.orderId, data.issues);
  });
  
  // Start listening for payment events
  return integration;
}

// Example 5: Reconciliation process for daily settlement
async function reconcilePaymentsExample() {
  const integration = new PaymentVerificationIntegration();
  
  // Get yesterday's date range
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(0, 0, 0, 0);
  
  const dayEnd = new Date(yesterday);
  dayEnd.setHours(23, 59, 59, 999);
  
  console.log(`Starting reconciliation for ${yesterday.toISOString()} to ${dayEnd.toISOString()}...`);
  
  const result = await integration.reconcilePayments({
    startDate: yesterday.toISOString(),
    endDate: dayEnd.toISOString()
  });
  
  if (result.success) {
    console.log('Reconciliation initiated successfully!');
    console.log('Reconciliation ID:', result.reconciliationId);
    console.log('Check back later for results or subscribe to reconciliation events');
  } else {
    console.error('Failed to start reconciliation:', result.error);
  }
  
  return result;
}

// Example 6: Get verification analytics for dashboard
async function getVerificationAnalyticsExample() {
  const integration = new PaymentVerificationIntegration();
  
  console.log('Fetching verification analytics...');
  
  const result = await integration.getVerificationAnalytics();
  
  if (result.success) {
    console.log('Analytics:');
    console.log(`Total verifications: ${result.data.totalVerifications}`);
    console.log('Status breakdown:', result.data.byStatus);
    console.log('Results breakdown:', result.data.byResult);
    
    if (result.data.commonIssues && result.data.commonIssues.length > 0) {
      console.log('Common issues:');
      result.data.commonIssues.forEach(issue => {
        console.log(`- ${issue.issue}: ${issue.count} occurrences`);
      });
    }
  } else {
    console.error('Failed to get analytics:', result.error);
  }
  
  return result;
}

// Mock functions used in examples
function updateOrderStatus(orderId, status) {
  console.log(`[MOCK] Updating order ${orderId} status to ${status}`);
}

function flagOrderForReview(orderId, issues) {
  console.log(`[MOCK] Flagging order ${orderId} for review due to:`, issues);
}

// Example execution (commented out)
/*
// Example 1
verifyPaymentExample('tx_1234567890', 'order_abcdef');

// Example 2
const orderData = {
  orderId: 'order_123456',
  userId: 'user_789',
  totalPrice: 99.99,
  paymentMethod: 'credit_card',
  paymentDetails: {
    cardNumber: '4111111111111111',
    cvv: '123',
    expiryMonth: 12,
    expiryYear: 2025
  }
};
processAndVerifyPaymentExample(orderData);

// Example 3
verifyOrderPaymentExample('order_123456');

// Example 4
const integrationService = setupPaymentVerificationListeners();
// This service would keep running in your application

// Example 5
reconcilePaymentsExample();

// Example 6
getVerificationAnalyticsExample();
*/

// Export the examples
module.exports = {
  verifyPaymentExample,
  processAndVerifyPaymentExample,
  verifyOrderPaymentExample,
  setupPaymentVerificationListeners,
  reconcilePaymentsExample,
  getVerificationAnalyticsExample
};
