/*
 * Rubberduck Demo - Payment Verification Microservice for Juice Shop
 * This microservice handles verification of payment transactions,
 * reconciliation with order systems, and notification of payment status.
 */

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const axios = require('axios');
const { EventEmitter } = require('events');
const crypto = require('crypto');

class PaymentVerificationService extends EventEmitter {
  constructor() {
    super();
    this.app = express();
    this.port = Number.parseInt(process.env.PAYMENT_VERIFICATION_PORT, 10) || 3002;
    this.paymentServiceUrl = process.env.PAYMENT_SERVICE_URL || 'http://localhost:3001';
    this.juiceShopUrl = process.env.JUICE_SHOP_URL || 'http://localhost:3000';
    this.allowedOrigins = this.parseAllowedOrigins(process.env.ALLOWED_ORIGINS);
    this.allowedPaymentStatuses = new Set(['pending', 'completed', 'failed', 'refunded']);
    this.allowedNotificationTargets = new Set(['email', 'sms', 'webhook']);
    this.requestTimeoutMs = 5000;
    
    // Store verification records in memory while they are processed or queried.
    this.verifications = new Map();
    
    // Cache transaction data to reduce repeated calls to the payment service.
    this.transactionCache = new Map();
    
    this.setupMiddleware();
    this.setupRoutes();
  }

  // Configure middleware that limits the request surface and logs incoming traffic.
  setupMiddleware() {
    // Only allow trusted browser origins while still permitting server-to-server requests.
    this.app.use(cors({
      origin: (origin, callback) => {
        if (!origin || this.allowedOrigins.includes(origin)) {
          return callback(null, true);
        }

        return callback(new Error('Origin not allowed by CORS policy'));
      },
      credentials: true
    }));
    // Keep request bodies small because verification payloads only contain identifiers and metadata.
    this.app.use(bodyParser.json({ limit: '100kb' }));
    this.app.use(bodyParser.urlencoded({ extended: false, limit: '10kb' }));
    
    // Log basic request metadata for troubleshooting and auditability.
    this.app.use((req, res, next) => {
      console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
      next();
    });
  }

  // Register every public endpoint exposed by the verification microservice.
  setupRoutes() {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({ 
        status: 'healthy', 
        service: 'payment-verification-service',
        timestamp: new Date().toISOString(),
        version: '1.0.0'
      });
    });

    // Verification endpoints
    this.app.post('/api/verify/transaction', this.verifyTransaction.bind(this));
    this.app.get('/api/verify/status/:verificationId', this.getVerificationStatus.bind(this));
    this.app.post('/api/verify/reconcile', this.reconcilePayments.bind(this));
    
    // Order verification
    this.app.get('/api/verify/order/:orderId', this.verifyOrderPayment.bind(this));
    
    // Notification webhooks
    this.app.post('/api/notify/payment-status', this.notifyPaymentStatus.bind(this));
    
    // Analytics and reporting
    this.app.get('/api/verify/analytics', this.getVerificationAnalytics.bind(this));
  }

  // Validate a verification request, persist a pending record and start async processing.
  async verifyTransaction(req, res) {
    try {
      const requestBody = req.body ?? {};
      const { transactionId, orderId, expectedAmount } = requestBody;
      const hasExpectedAmount = Object.prototype.hasOwnProperty.call(requestBody, 'expectedAmount');

      if (!transactionId) {
        return res.status(400).json({
          status: 'error',
          message: 'Transaction ID is required',
          code: 'MISSING_TRANSACTION_ID'
        });
      }

      // Reject malformed identifiers before they reach caches, logs or downstream URLs.
      if (!this.isValidIdentifier(transactionId)) {
        return res.status(400).json({
          status: 'error',
          message: 'Transaction ID format is invalid',
          code: 'INVALID_TRANSACTION_ID'
        });
      }

      if (orderId && !this.isValidIdentifier(orderId)) {
        return res.status(400).json({
          status: 'error',
          message: 'Order ID format is invalid',
          code: 'INVALID_ORDER_ID'
        });
      }

      // Parse and validate the optional amount before comparing financial values later.
      const parsedExpectedAmount = this.parseExpectedAmount(expectedAmount);
      if (hasExpectedAmount && parsedExpectedAmount === null) {
        return res.status(400).json({
          status: 'error',
          message: 'Expected amount must be a valid positive number',
          code: 'INVALID_EXPECTED_AMOUNT'
        });
      }

      // Generate a unique ID for the new verification request.
      const verificationId = this.generateVerificationId();
      
      // Create an in-memory record so the caller can poll for progress immediately.
      const verification = {
        id: verificationId,
        transactionId,
        orderId,
        expectedAmount: parsedExpectedAmount,
        status: 'pending',
        createdAt: new Date().toISOString(),
        completedAt: null,
        result: null,
        issues: []
      };

      // Persist the pending record before starting the asynchronous verification work.
      this.verifications.set(verificationId, verification);

      // Perform the heavy verification work asynchronously so the API stays responsive.
      this.performVerification(verification)
        .then(() => {
          console.log(`Verification completed: ${verificationId}`);
          this.emit('verification_completed', verification);
        })
        .catch(error => {
          console.error(`Verification error: ${verificationId}`, error);
          verification.status = 'error';
          verification.issues.push('Verification process failed');
          verification.completedAt = new Date().toISOString();
          this.emit('verification_error', { verificationId, error: error.message });
        });

      // Return a tracking ID immediately so the client can poll for the final result.
      res.json({
        status: 'success',
        message: 'Verification initiated',
        verificationId,
        transactionId
      });
    } catch (error) {
      console.error('Verification request error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal verification error',
        code: 'VERIFICATION_ERROR'
      });
    }
  }

  // Fetch transaction details, compare them with the request and record any mismatches.
  async performVerification(verification) {
    try {
      // Fetch the latest transaction details from the payment service or local cache.
      const transactionDetails = await this.fetchTransactionDetails(verification.transactionId);
      
      if (!transactionDetails) {
        verification.status = 'failed';
        verification.issues.push('Transaction not found in payment system');
        verification.result = 'invalid';
        verification.completedAt = new Date().toISOString();
        return;
      }

      if (!this.isValidTransactionDetails(transactionDetails)) {
        verification.status = 'failed';
        verification.issues.push('Transaction data from payment system is invalid');
        verification.result = 'invalid';
        verification.completedAt = new Date().toISOString();
        return;
      }
      
      // Cache validated transaction data to reduce repeated API calls for the same ID.
      this.transactionCache.set(verification.transactionId, transactionDetails);
      
      // Collect every mismatch so callers receive a complete verification result.
      const issues = [];
      const actualAmount = Number(transactionDetails.amount);
      
      // Ensure the payment completed successfully before accepting it as valid.
      if (transactionDetails.status !== 'completed') {
        issues.push(`Transaction status is ${transactionDetails.status}, not completed`);
      }
      
      // Compare amounts with a small tolerance to avoid floating-point rounding noise.
      if (verification.expectedAmount !== null && 
          Math.abs(actualAmount - verification.expectedAmount) > 0.01) {
        issues.push(`Amount mismatch: expected ${verification.expectedAmount}, actual ${actualAmount}`);
      }
      
      // Confirm the transaction is linked to the order expected by the caller.
      if (verification.orderId && verification.orderId !== transactionDetails.orderId) {
        issues.push(`Order ID mismatch: expected ${verification.orderId}, actual ${transactionDetails.orderId}`);
      }
      
      // Persist the final verification outcome for later status lookups and analytics.
      verification.issues = issues;
      verification.status = issues.length > 0 ? 'failed' : 'completed';
      verification.result = issues.length > 0 ? 'invalid' : 'valid';
      verification.completedAt = new Date().toISOString();
      verification.transactionDetails = {
        status: transactionDetails.status,
        amount: actualAmount,
        currency: transactionDetails.currency,
        orderId: transactionDetails.orderId,
        createdAt: transactionDetails.createdAt,
        completedAt: transactionDetails.completedAt
      };
      
      // Notify monitoring listeners when verification mismatches are found.
      if (issues.length > 0) {
        this.emit('verification_issues', { 
          verificationId: verification.id, 
          issues,
          transactionId: verification.transactionId
        });
      }
      
      return verification;
    } catch (error) {
      console.error(`Error performing verification for ${verification.id}:`, error);
      verification.status = 'error';
      verification.issues.push('Verification process error');
      verification.result = 'error';
      verification.completedAt = new Date().toISOString();
      throw error;
    }
  }

  // Retrieve transaction details from cache first, then fall back to the payment service API.
  async fetchTransactionDetails(transactionId) {
    try {
      // Ignore malformed transaction identifiers before building outbound URLs.
      if (!this.isValidIdentifier(transactionId)) {
        return null;
      }

      // Reuse cached responses for repeat lookups of the same transaction ID.
      if (this.transactionCache.has(transactionId)) {
        return this.transactionCache.get(transactionId);
      }
      
      // Call the payment service with a timeout so slow downstream calls do not hang this service.
      const response = await axios.get(
        `${this.paymentServiceUrl}/api/payments/transaction/${encodeURIComponent(transactionId)}`,
        { timeout: this.requestTimeoutMs }
      );
      
      if (response?.data?.status === 'success') {
        return response.data.data;
      }
      
      return null;
    } catch (error) {
      console.error(`Error fetching transaction ${transactionId}:`, error.message);
      return null;
    }
  }

  // Return the current state of a previously created verification job.
  getVerificationStatus(req, res) {
    const { verificationId } = req.params;

    // Validate the lookup identifier before reading from the in-memory store.
    if (!this.isValidIdentifier(verificationId)) {
      return res.status(400).json({
        status: 'error',
        message: 'Verification ID format is invalid'
      });
    }

    const verification = this.verifications.get(verificationId);

    if (!verification) {
      return res.status(404).json({
        status: 'error',
        message: 'Verification not found'
      });
    }

    res.json({
      status: 'success',
      data: {
        verificationId: verification.id,
        transactionId: verification.transactionId,
        orderId: verification.orderId,
        status: verification.status,
        result: verification.result,
        issues: verification.issues,
        createdAt: verification.createdAt,
        completedAt: verification.completedAt,
        transactionDetails: verification.transactionDetails
      }
    });
  }

  // Check whether any cached transaction proves that an order has been paid.
  async verifyOrderPayment(req, res) {
    try {
      const { orderId } = req.params;
      
      if (!orderId) {
        return res.status(400).json({
          status: 'error',
          message: 'Order ID is required'
        });
      }

      // Reject malformed order identifiers before querying cached or remote data.
      if (!this.isValidIdentifier(orderId)) {
        return res.status(400).json({
          status: 'error',
          message: 'Order ID format is invalid'
        });
      }
      
      // Search for transactions that were already cached for this order.
      const orderTransactions = await this.findTransactionsByOrderId(orderId);
      
      if (!orderTransactions || orderTransactions.length === 0) {
        return res.json({
          status: 'success',
          data: {
            orderId,
            paymentVerified: false,
            message: 'No payment transactions found for this order'
          }
        });
      }
      
      // Treat the order as verified only when at least one payment completed successfully.
      const successfulPayment = orderTransactions.find(tx => tx.status === 'completed');
      
      // Return a condensed view of the relevant transactions for the order.
      res.json({
        status: 'success',
        data: {
          orderId,
          paymentVerified: !!successfulPayment,
          message: successfulPayment ? 
            'Payment verified successfully' : 
            'No successful payment found for this order',
          transactions: orderTransactions.map(tx => ({
            transactionId: tx.id || tx.transactionId,
            status: tx.status,
            amount: tx.amount,
            currency: tx.currency,
            timestamp: tx.completedAt || tx.createdAt
          }))
        }
      });
    } catch (error) {
      console.error(`Order payment verification error for ${req.params.orderId}:`, error);
      res.status(500).json({
        status: 'error',
        message: 'Error verifying order payment'
      });
    }
  }

  // Find cached transactions that were previously associated with a specific order ID.
  async findTransactionsByOrderId(orderId) {
    try {
      // In a real implementation, you would query the payment service
      // Here we'll search the transaction cache
      const transactions = [];
      
      // Inspect the local cache to find transactions that match the requested order.
      for (const [_, transaction] of this.transactionCache.entries()) {
        if (transaction.orderId === orderId) {
          transactions.push(transaction);
        }
      }
      
      // If we don't have any cached transactions for this order,
      // we would make an API call to the payment service
      // This is a simplified implementation
      
      return transactions;
    } catch (error) {
      console.error(`Error finding transactions for order ${orderId}:`, error);
      return [];
    }
  }

  // Validate reconciliation filters and launch the asynchronous reconciliation workflow.
  async reconcilePayments(req, res) {
    try {
      const { startDate, endDate, orderIds } = req.body ?? {};

      // Validate the optional reconciliation filters before starting background work.
      if ((startDate && !this.isValidDateInput(startDate)) || (endDate && !this.isValidDateInput(endDate))) {
        return res.status(400).json({
          status: 'error',
          message: 'Start and end dates must be valid ISO-8601 date values'
        });
      }

      if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
        return res.status(400).json({
          status: 'error',
          message: 'Start date must be before or equal to end date'
        });
      }

      if (orderIds !== undefined) {
        if (!Array.isArray(orderIds) || orderIds.length > 100 || orderIds.some(orderId => !this.isValidIdentifier(orderId))) {
          return res.status(400).json({
            status: 'error',
            message: 'Order IDs must be an array of up to 100 valid identifiers'
          });
        }
      }
      
      // In a real implementation, this would reconcile payments with an external system
      // or compare against order database records
      
      const reconciliationId = `recon_${Date.now()}`;
      
      // Start async reconciliation process
      this.performReconciliation(reconciliationId, { startDate, endDate, orderIds })
        .then(result => {
          console.log(`Reconciliation completed: ${reconciliationId}`);
          this.emit('reconciliation_completed', { reconciliationId, result });
        })
        .catch(error => {
          console.error(`Reconciliation error: ${reconciliationId}`, error);
          this.emit('reconciliation_error', { reconciliationId, error: error.message });
        });
      
      res.json({
        status: 'success',
        message: 'Reconciliation process initiated',
        reconciliationId
      });
    } catch (error) {
      console.error('Reconciliation request error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Reconciliation process error'
      });
    }
  }

  // Produce a lightweight reconciliation summary for the requested time window.
  async performReconciliation(reconciliationId, options) {
    // Mock implementation
    return {
      id: reconciliationId,
      timestamp: new Date().toISOString(),
      totalTransactions: Math.floor(Math.random() * 100) + 1,
      matchedTransactions: Math.floor(Math.random() * 80) + 1,
      unmatchedTransactions: Math.floor(Math.random() * 20),
      options
    };
  }

  // Validate a notification request and dispatch it through the selected channel.
  async notifyPaymentStatus(req, res) {
    try {
      const { transactionId, status, target } = req.body ?? {};
      
      if (!transactionId || !status) {
        return res.status(400).json({
          status: 'error',
          message: 'Transaction ID and status are required'
        });
      }

      // Validate notification input before loading transaction data or choosing a channel.
      if (!this.isValidIdentifier(transactionId)) {
        return res.status(400).json({
          status: 'error',
          message: 'Transaction ID format is invalid'
        });
      }

      if (!this.allowedPaymentStatuses.has(status)) {
        return res.status(400).json({
          status: 'error',
          message: 'Payment status is invalid'
        });
      }
      
      // Determine and validate the notification target before sending anything.
      const notificationTarget = target || 'email';
      if (!this.allowedNotificationTargets.has(notificationTarget)) {
        return res.status(400).json({
          status: 'error',
          message: 'Notification target is invalid'
        });
      }

      // Load the transaction so the notification contains authoritative payment data.
      const transaction = await this.fetchTransactionDetails(transactionId);
      
      if (!transaction) {
        return res.status(404).json({
          status: 'error',
          message: 'Transaction not found'
        });
      }
      
      // Send the notification through the selected channel.
      const notificationId = await this.sendNotification(
        notificationTarget,
        {
          transactionId,
          status,
          orderId: transaction.orderId,
          amount: transaction.amount,
          currency: transaction.currency
        }
      );
      
      res.json({
        status: 'success',
        message: `Notification sent via ${notificationTarget}`,
        notificationId
      });
    } catch (error) {
      console.error('Notification error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Error sending notification'
      });
    }
  }

  // Create a mock notification ID and log the payload that would be sent in production.
  async sendNotification(channel, data) {
    // Mock implementation - in a real service this would send actual notifications
    const notificationId = `notif_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    
    console.log(`[MOCK] Sending ${channel} notification:`, data);
    
    return notificationId;
  }

  // Aggregate verification records into a compact analytics response.
  getVerificationAnalytics(req, res) {
    try {
      const verifications = Array.from(this.verifications.values());
      
      // Build high-level metrics plus a short list of the most recent verification jobs.
      const analytics = {
        totalVerifications: verifications.length,
        byStatus: {
          pending: verifications.filter(v => v.status === 'pending').length,
          completed: verifications.filter(v => v.status === 'completed').length,
          failed: verifications.filter(v => v.status === 'failed').length,
          error: verifications.filter(v => v.status === 'error').length
        },
        byResult: {
          valid: verifications.filter(v => v.result === 'valid').length,
          invalid: verifications.filter(v => v.result === 'invalid').length,
          error: verifications.filter(v => v.result === 'error').length,
          pending: verifications.filter(v => v.result === null).length
        },
        commonIssues: this.aggregateCommonIssues(verifications),
        recentVerifications: verifications
          .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
          .slice(0, 10)
          .map(v => ({
            id: v.id,
            transactionId: v.transactionId,
            status: v.status,
            result: v.result,
            createdAt: v.createdAt
          }))
      };
      
      res.json({
        status: 'success',
        data: analytics
      });
    } catch (error) {
      console.error('Analytics error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Error generating analytics'
      });
    }
  }

  // Count recurring verification issues so operators can spot common failure patterns.
  aggregateCommonIssues(verifications) {
    const issueCount = {};
    
    verifications.forEach(verification => {
      if (verification.issues && verification.issues.length > 0) {
        verification.issues.forEach(issue => {
          // Extract the issue type (everything before the first ":")
          const issueType = issue.includes(':') ? 
            issue.substring(0, issue.indexOf(':')) : 
            issue;
            
          issueCount[issueType] = (issueCount[issueType] || 0) + 1;
        });
      }
    });
    
    // Convert to array and sort
    return Object.entries(issueCount)
      .map(([issue, count]) => ({ issue, count }))
      .sort((a, b) => b.count - a.count);
  }

  // Parse the configured list of trusted origins for browser-based access.
  parseAllowedOrigins(allowedOrigins) {
    if (!allowedOrigins) {
      return [this.juiceShopUrl];
    }

    return allowedOrigins
      .split(',')
      .map(origin => origin.trim())
      .filter(Boolean);
  }

  // Accept short identifier values that are safe to log, cache and embed in URLs.
  isValidIdentifier(value) {
    return typeof value === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(value);
  }

  // Parse an optional amount and reject negative or non-numeric values.
  parseExpectedAmount(value) {
    if (value === undefined || value === null || value === '') {
      return null;
    }

    const parsedValue = Number(value);
    return Number.isFinite(parsedValue) && parsedValue >= 0 ? parsedValue : null;
  }

  // Ensure remote transaction data includes the fields needed for secure comparisons.
  isValidTransactionDetails(transactionDetails) {
    return transactionDetails !== null &&
      typeof transactionDetails === 'object' &&
      typeof transactionDetails.status === 'string' &&
      Number.isFinite(Number(transactionDetails.amount)) &&
      (transactionDetails.orderId === undefined || this.isValidIdentifier(transactionDetails.orderId));
  }

  // Validate ISO date strings used to limit reconciliation jobs.
  isValidDateInput(value) {
    return typeof value === 'string' && !Number.isNaN(Date.parse(value));
  }

  // Generate a collision-resistant identifier for every verification request.
  generateVerificationId() {
    return `verify_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
  }

  // Start the HTTP server and attach event listeners used for operational logging.
  start() {
    this.app.listen(this.port, () => {
      console.log(`Payment Verification Service running on port ${this.port}`);
      console.log(`Health check: http://localhost:${this.port}/health`);
    });

    // Event listeners for logging
    this.on('verification_completed', (verification) => {
      console.log(`Verification completed: ${verification.id} - Result: ${verification.result}`);
    });

    this.on('verification_issues', (data) => {
      console.log(`Verification ${data.verificationId} found issues:`, data.issues);
    });
    
    this.on('verification_error', (data) => {
      console.error(`Verification error for ${data.verificationId}:`, data.error);
    });
    
    this.on('reconciliation_completed', (data) => {
      console.log(`Reconciliation completed: ${data.reconciliationId}`);
    });
  }
}

// Export the service
module.exports = PaymentVerificationService;

// Start the service if this file is run directly
if (require.main === module) {
  const verificationService = new PaymentVerificationService();
  verificationService.start();
}
