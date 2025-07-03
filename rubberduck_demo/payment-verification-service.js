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
    this.port = process.env.PAYMENT_VERIFICATION_PORT || 3002;
    this.paymentServiceUrl = process.env.PAYMENT_SERVICE_URL || 'http://localhost:3001';
    this.juiceShopUrl = process.env.JUICE_SHOP_URL || 'http://localhost:3000';
    
    // Store verification records
    this.verifications = new Map();
    
    // Cache of transaction data to reduce calls to payment service
    this.transactionCache = new Map();
    
    this.setupMiddleware();
    this.setupRoutes();
  }

  setupMiddleware() {
    this.app.use(cors({
      origin: process.env.ALLOWED_ORIGINS || '*',
      credentials: true
    }));
    this.app.use(bodyParser.json({ limit: '10mb' }));
    this.app.use(bodyParser.urlencoded({ extended: true }));
    
    // Request logging middleware
    this.app.use((req, res, next) => {
      console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
      next();
    });
  }

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

  async verifyTransaction(req, res) {
    try {
      const { transactionId, orderId, expectedAmount } = req.body;

      if (!transactionId) {
        return res.status(400).json({
          status: 'error',
          message: 'Transaction ID is required',
          code: 'MISSING_TRANSACTION_ID'
        });
      }

      // Generate verification ID
      const verificationId = this.generateVerificationId();
      
      // Create verification record
      const verification = {
        id: verificationId,
        transactionId,
        orderId,
        expectedAmount: expectedAmount ? parseFloat(expectedAmount) : null,
        status: 'pending',
        createdAt: new Date().toISOString(),
        completedAt: null,
        result: null,
        issues: []
      };

      // Store verification record
      this.verifications.set(verificationId, verification);

      // Start asynchronous verification process
      this.performVerification(verification)
        .then(() => {
          console.log(`Verification completed: ${verificationId}`);
          this.emit('verification_completed', verification);
        })
        .catch(error => {
          console.error(`Verification error: ${verificationId}`, error);
          verification.status = 'error';
          verification.issues.push('Verification process failed: ' + error.message);
          verification.completedAt = new Date().toISOString();
          this.emit('verification_error', { verificationId, error: error.message });
        });

      // Return immediate response with verification ID
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

  async performVerification(verification) {
    try {
      // Fetch transaction details from payment service
      const transactionDetails = await this.fetchTransactionDetails(verification.transactionId);
      
      if (!transactionDetails) {
        verification.status = 'failed';
        verification.issues.push('Transaction not found in payment system');
        verification.result = 'invalid';
        verification.completedAt = new Date().toISOString();
        return;
      }
      
      // Cache transaction details to reduce future API calls
      this.transactionCache.set(verification.transactionId, transactionDetails);
      
      // Verify the transaction
      const issues = [];
      
      // Check transaction status
      if (transactionDetails.status !== 'completed') {
        issues.push(`Transaction status is ${transactionDetails.status}, not completed`);
      }
      
      // Check amount if expected amount was provided
      if (verification.expectedAmount !== null && 
          Math.abs(transactionDetails.amount - verification.expectedAmount) > 0.01) {
        issues.push(`Amount mismatch: expected ${verification.expectedAmount}, actual ${transactionDetails.amount}`);
      }
      
      // Verify order ID if provided
      if (verification.orderId && verification.orderId !== transactionDetails.orderId) {
        issues.push(`Order ID mismatch: expected ${verification.orderId}, actual ${transactionDetails.orderId}`);
      }
      
      // Update verification record
      verification.issues = issues;
      verification.status = issues.length > 0 ? 'failed' : 'completed';
      verification.result = issues.length > 0 ? 'invalid' : 'valid';
      verification.completedAt = new Date().toISOString();
      verification.transactionDetails = {
        status: transactionDetails.status,
        amount: transactionDetails.amount,
        currency: transactionDetails.currency,
        orderId: transactionDetails.orderId,
        createdAt: transactionDetails.createdAt,
        completedAt: transactionDetails.completedAt
      };
      
      // If the verification has issues, emit an event for monitoring systems
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
      verification.issues.push('Verification process error: ' + error.message);
      verification.result = 'error';
      verification.completedAt = new Date().toISOString();
      throw error;
    }
  }

  async fetchTransactionDetails(transactionId) {
    try {
      // Check cache first
      if (this.transactionCache.has(transactionId)) {
        return this.transactionCache.get(transactionId);
      }
      
      // Call payment service API
      const response = await axios.get(`${this.paymentServiceUrl}/api/payments/transaction/${transactionId}`);
      
      if (response.data.status === 'success') {
        return response.data.data;
      }
      
      return null;
    } catch (error) {
      console.error(`Error fetching transaction ${transactionId}:`, error.message);
      return null;
    }
  }

  getVerificationStatus(req, res) {
    const { verificationId } = req.params;
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

  async verifyOrderPayment(req, res) {
    try {
      const { orderId } = req.params;
      
      if (!orderId) {
        return res.status(400).json({
          status: 'error',
          message: 'Order ID is required'
        });
      }
      
      // Search for transactions related to this order
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
      
      // Check if there's a successful payment
      const successfulPayment = orderTransactions.find(tx => tx.status === 'completed');
      
      // Return verification result
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

  async findTransactionsByOrderId(orderId) {
    try {
      // In a real implementation, you would query the payment service
      // Here we'll search the transaction cache
      const transactions = [];
      
      // Check cache for transactions matching the order ID
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

  async reconcilePayments(req, res) {
    try {
      const { startDate, endDate, orderIds } = req.body;
      
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

  async notifyPaymentStatus(req, res) {
    try {
      const { transactionId, status, target } = req.body;
      
      if (!transactionId || !status) {
        return res.status(400).json({
          status: 'error',
          message: 'Transaction ID and status are required'
        });
      }
      
      // Get transaction details
      const transaction = await this.fetchTransactionDetails(transactionId);
      
      if (!transaction) {
        return res.status(404).json({
          status: 'error',
          message: 'Transaction not found'
        });
      }
      
      // Determine notification target
      const notificationTarget = target || 'email';
      
      // Send notification (mock implementation)
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

  async sendNotification(channel, data) {
    // Mock implementation - in a real service this would send actual notifications
    const notificationId = `notif_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    
    console.log(`[MOCK] Sending ${channel} notification:`, data);
    
    return notificationId;
  }

  getVerificationAnalytics(req, res) {
    try {
      const verifications = Array.from(this.verifications.values());
      
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

  generateVerificationId() {
    return `verify_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
  }

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
