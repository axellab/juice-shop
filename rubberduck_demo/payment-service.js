/*
 * Rubberduck Demo - Payment Microservice for Juice Shop
 * This microservice handles payment processing, transaction management,
 * and payment method integration for the Juice Shop application.
 */

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const crypto = require('crypto');
const { EventEmitter } = require('events');

class PaymentService extends EventEmitter {
  constructor() {
    super();
    this.app = express();
    this.port = process.env.PAYMENT_SERVICE_PORT || 3001;
    this.transactions = new Map();
    this.paymentProviders = new Map();
    
    this.setupMiddleware();
    this.setupRoutes();
    this.initializePaymentProviders();
  }

  setupMiddleware() {
    this.app.use(cors({
      origin: process.env.ALLOWED_ORIGINS || 'http://localhost:3000',
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
        service: 'payment-service',
        timestamp: new Date().toISOString(),
        version: '1.0.0'
      });
    });

    // Payment processing endpoints
    this.app.post('/api/payments/process', this.processPayment.bind(this));
    this.app.post('/api/payments/validate', this.validatePayment.bind(this));
    this.app.get('/api/payments/transaction/:transactionId', this.getTransactionStatus.bind(this));
    this.app.post('/api/payments/refund', this.processRefund.bind(this));
    
    // Payment method management
    this.app.post('/api/payments/methods/validate-card', this.validateCreditCard.bind(this));
    this.app.post('/api/payments/methods/tokenize', this.tokenizePaymentMethod.bind(this));
    
    // Wallet operations
    this.app.post('/api/payments/wallet/charge', this.chargeWallet.bind(this));
    this.app.post('/api/payments/wallet/balance', this.getWalletBalance.bind(this));
    
    // Transaction history
    this.app.get('/api/payments/history/:userId', this.getPaymentHistory.bind(this));
    this.app.get('/api/payments/analytics', this.getPaymentAnalytics.bind(this));
  }

  initializePaymentProviders() {
    // Initialize mock payment providers
    this.paymentProviders.set('credit_card', new CreditCardProvider());
    this.paymentProviders.set('paypal', new PayPalProvider());
    this.paymentProviders.set('stripe', new StripeProvider());
    this.paymentProviders.set('wallet', new WalletProvider());
  }

  async processPayment(req, res) {
    try {
      const { 
        amount, 
        currency = 'USD', 
        paymentMethod, 
        userId, 
        orderId, 
        paymentDetails 
      } = req.body;

      // Validate required fields
      if (!amount || !paymentMethod || !userId || !orderId) {
        return res.status(400).json({
          status: 'error',
          message: 'Missing required payment information',
          code: 'INVALID_REQUEST'
        });
      }

      // Generate transaction ID
      const transactionId = this.generateTransactionId();
      
      // Create transaction record
      const transaction = {
        id: transactionId,
        amount: parseFloat(amount),
        currency,
        paymentMethod,
        userId,
        orderId,
        status: 'processing',
        createdAt: new Date().toISOString(),
        attempts: 1,
        metadata: paymentDetails || {}
      };

      this.transactions.set(transactionId, transaction);

      // Get payment provider
      const provider = this.paymentProviders.get(paymentMethod);
      if (!provider) {
        transaction.status = 'failed';
        transaction.failureReason = 'Unsupported payment method';
        return res.status(400).json({
          status: 'error',
          message: 'Unsupported payment method',
          transactionId,
          code: 'INVALID_PAYMENT_METHOD'
        });
      }

      // Process payment with provider
      const result = await provider.processPayment(transaction);
      
      // Update transaction status
      transaction.status = result.success ? 'completed' : 'failed';
      transaction.providerId = result.providerId;
      transaction.providerResponse = result.response;
      transaction.completedAt = new Date().toISOString();
      
      if (!result.success) {
        transaction.failureReason = result.error;
      }

      // Emit payment event
      this.emit('payment_processed', transaction);

      res.json({
        status: result.success ? 'success' : 'error',
        transactionId,
        message: result.message,
        data: {
          amount: transaction.amount,
          currency: transaction.currency,
          status: transaction.status,
          orderId: transaction.orderId
        }
      });

    } catch (error) {
      console.error('Payment processing error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal payment processing error',
        code: 'PROCESSING_ERROR'
      });
    }
  }

  async validatePayment(req, res) {
    try {
      const { paymentMethod, paymentDetails } = req.body;

      const provider = this.paymentProviders.get(paymentMethod);
      if (!provider) {
        return res.status(400).json({
          status: 'error',
          message: 'Unsupported payment method'
        });
      }

      const isValid = await provider.validatePaymentDetails(paymentDetails);
      
      res.json({
        status: 'success',
        valid: isValid,
        paymentMethod
      });

    } catch (error) {
      console.error('Payment validation error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Validation error'
      });
    }
  }

  getTransactionStatus(req, res) {
    const { transactionId } = req.params;
    const transaction = this.transactions.get(transactionId);

    if (!transaction) {
      return res.status(404).json({
        status: 'error',
        message: 'Transaction not found'
      });
    }

    res.json({
      status: 'success',
      data: {
        transactionId: transaction.id,
        status: transaction.status,
        amount: transaction.amount,
        currency: transaction.currency,
        createdAt: transaction.createdAt,
        completedAt: transaction.completedAt,
        failureReason: transaction.failureReason
      }
    });
  }

  async processRefund(req, res) {
    try {
      const { transactionId, amount, reason } = req.body;
      
      const originalTransaction = this.transactions.get(transactionId);
      if (!originalTransaction) {
        return res.status(404).json({
          status: 'error',
          message: 'Original transaction not found'
        });
      }

      if (originalTransaction.status !== 'completed') {
        return res.status(400).json({
          status: 'error',
          message: 'Cannot refund non-completed transaction'
        });
      }

      const refundAmount = amount || originalTransaction.amount;
      if (refundAmount > originalTransaction.amount) {
        return res.status(400).json({
          status: 'error',
          message: 'Refund amount cannot exceed original transaction amount'
        });
      }

      // Create refund transaction
      const refundId = this.generateTransactionId();
      const refundTransaction = {
        id: refundId,
        type: 'refund',
        originalTransactionId: transactionId,
        amount: refundAmount,
        currency: originalTransaction.currency,
        userId: originalTransaction.userId,
        status: 'processing',
        reason,
        createdAt: new Date().toISOString()
      };

      this.transactions.set(refundId, refundTransaction);

      // Process refund with provider
      const provider = this.paymentProviders.get(originalTransaction.paymentMethod);
      const result = await provider.processRefund(originalTransaction, refundAmount);

      refundTransaction.status = result.success ? 'completed' : 'failed';
      refundTransaction.completedAt = new Date().toISOString();

      this.emit('refund_processed', refundTransaction);

      res.json({
        status: result.success ? 'success' : 'error',
        refundId,
        message: result.message,
        data: {
          amount: refundAmount,
          originalTransactionId: transactionId
        }
      });

    } catch (error) {
      console.error('Refund processing error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Refund processing error'
      });
    }
  }

  validateCreditCard(req, res) {
    const { cardNumber, cvv, expiryMonth, expiryYear } = req.body;
    
    const validation = {
      valid: true,
      errors: []
    };

    // Basic card number validation (Luhn algorithm)
    if (!this.isValidCardNumber(cardNumber)) {
      validation.valid = false;
      validation.errors.push('Invalid card number');
    }

    // CVV validation
    if (!cvv || cvv.length < 3 || cvv.length > 4) {
      validation.valid = false;
      validation.errors.push('Invalid CVV');
    }

    // Expiry validation
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    
    if (expiryYear < currentYear || (expiryYear === currentYear && expiryMonth < currentMonth)) {
      validation.valid = false;
      validation.errors.push('Card has expired');
    }

    res.json({
      status: 'success',
      validation
    });
  }

  tokenizePaymentMethod(req, res) {
    const { paymentMethod, paymentDetails } = req.body;
    
    // Generate secure token
    const token = crypto.randomBytes(32).toString('hex');
    
    // In a real implementation, you would securely store the mapping
    // between token and payment details
    
    res.json({
      status: 'success',
      token,
      paymentMethod,
      lastFour: paymentDetails.cardNumber ? 
        paymentDetails.cardNumber.slice(-4) : undefined
    });
  }

  async chargeWallet(req, res) {
    try {
      const { userId, amount, paymentMethodId } = req.body;
      
      const provider = this.paymentProviders.get('wallet');
      const result = await provider.chargeWallet(userId, amount, paymentMethodId);
      
      res.json({
        status: result.success ? 'success' : 'error',
        message: result.message,
        data: result.data
      });

    } catch (error) {
      console.error('Wallet charge error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Wallet charge error'
      });
    }
  }

  async getWalletBalance(req, res) {
    try {
      const { userId } = req.body;
      
      const provider = this.paymentProviders.get('wallet');
      const result = await provider.getBalance(userId);
      
      res.json({
        status: 'success',
        data: {
          balance: result.balance,
          currency: result.currency || 'USD'
        }
      });

    } catch (error) {
      console.error('Wallet balance error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Unable to retrieve wallet balance'
      });
    }
  }

  getPaymentHistory(req, res) {
    const { userId } = req.params;
    const { limit = 50, offset = 0, status } = req.query;
    
    const userTransactions = Array.from(this.transactions.values())
      .filter(tx => tx.userId === userId)
      .filter(tx => !status || tx.status === status)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(offset, offset + parseInt(limit));

    res.json({
      status: 'success',
      data: {
        transactions: userTransactions,
        total: userTransactions.length,
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    });
  }

  getPaymentAnalytics(req, res) {
    const transactions = Array.from(this.transactions.values());
    
    const analytics = {
      totalTransactions: transactions.length,
      totalVolume: transactions
        .filter(tx => tx.status === 'completed')
        .reduce((sum, tx) => sum + tx.amount, 0),
      successRate: transactions.length > 0 ? 
        (transactions.filter(tx => tx.status === 'completed').length / transactions.length) * 100 : 0,
      paymentMethodBreakdown: {},
      recentTransactions: transactions
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, 10)
    };

    // Calculate payment method breakdown
    transactions.forEach(tx => {
      analytics.paymentMethodBreakdown[tx.paymentMethod] = 
        (analytics.paymentMethodBreakdown[tx.paymentMethod] || 0) + 1;
    });

    res.json({
      status: 'success',
      data: analytics
    });
  }

  generateTransactionId() {
    return `tx_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
  }

  isValidCardNumber(cardNumber) {
    // Remove spaces and non-digits
    const cleanNumber = cardNumber.replace(/\D/g, '');
    
    // Basic length check
    if (cleanNumber.length < 13 || cleanNumber.length > 19) {
      return false;
    }

    // Luhn algorithm
    let sum = 0;
    let isEvenPosition = false;

    for (let i = cleanNumber.length - 1; i >= 0; i--) {
      let digit = parseInt(cleanNumber.charAt(i));

      if (isEvenPosition) {
        digit *= 2;
        if (digit > 9) {
          digit = Math.floor(digit / 10) + (digit % 10);
        }
      }

      sum += digit;
      isEvenPosition = !isEvenPosition;
    }

    return sum % 10 === 0;
  }

  start() {
    this.app.listen(this.port, () => {
      console.log(`Payment Service running on port ${this.port}`);
      console.log(`Health check: http://localhost:${this.port}/health`);
    });

    // Event listeners
    this.on('payment_processed', (transaction) => {
      console.log(`Payment processed: ${transaction.id} - ${transaction.status}`);
    });

    this.on('refund_processed', (refund) => {
      console.log(`Refund processed: ${refund.id} - ${refund.status}`);
    });
  }
}

// Payment Provider Classes
class CreditCardProvider {
  async processPayment(transaction) {
    // Simulate credit card processing
    const success = Math.random() > 0.1; // 90% success rate
    
    return {
      success,
      providerId: `cc_${crypto.randomBytes(8).toString('hex')}`,
      message: success ? 'Payment processed successfully' : 'Payment declined',
      error: success ? null : 'Insufficient funds or invalid card',
      response: {
        authCode: success ? crypto.randomBytes(6).toString('hex').toUpperCase() : null,
        timestamp: new Date().toISOString()
      }
    };
  }

  async validatePaymentDetails(details) {
    return details.cardNumber && details.cvv && details.expiryMonth && details.expiryYear;
  }

  async processRefund(originalTransaction, amount) {
    // Simulate refund processing
    const success = Math.random() > 0.05; // 95% success rate
    
    return {
      success,
      message: success ? 'Refund processed successfully' : 'Refund failed',
      error: success ? null : 'Unable to process refund'
    };
  }
}

class PayPalProvider {
  async processPayment(transaction) {
    const success = Math.random() > 0.08; // 92% success rate
    
    return {
      success,
      providerId: `pp_${crypto.randomBytes(8).toString('hex')}`,
      message: success ? 'PayPal payment completed' : 'PayPal payment failed',
      error: success ? null : 'PayPal account issue',
      response: {
        paypalTransactionId: success ? `PAY-${crypto.randomBytes(8).toString('hex').toUpperCase()}` : null,
        timestamp: new Date().toISOString()
      }
    };
  }

  async validatePaymentDetails(details) {
    return details.email && details.paypalToken;
  }

  async processRefund(originalTransaction, amount) {
    const success = Math.random() > 0.03; // 97% success rate
    
    return {
      success,
      message: success ? 'PayPal refund processed' : 'PayPal refund failed'
    };
  }
}

class StripeProvider {
  async processPayment(transaction) {
    const success = Math.random() > 0.06; // 94% success rate
    
    return {
      success,
      providerId: `stripe_${crypto.randomBytes(8).toString('hex')}`,
      message: success ? 'Stripe payment successful' : 'Stripe payment failed',
      error: success ? null : 'Card declined by issuer',
      response: {
        chargeId: success ? `ch_${crypto.randomBytes(12).toString('hex')}` : null,
        timestamp: new Date().toISOString()
      }
    };
  }

  async validatePaymentDetails(details) {
    return details.stripeToken || (details.cardNumber && details.cvv);
  }

  async processRefund(originalTransaction, amount) {
    const success = Math.random() > 0.02; // 98% success rate
    
    return {
      success,
      message: success ? 'Stripe refund completed' : 'Stripe refund failed'
    };
  }
}

class WalletProvider {
  constructor() {
    this.wallets = new Map();
  }

  async processPayment(transaction) {
    const wallet = this.getWallet(transaction.userId);
    
    if (wallet.balance >= transaction.amount) {
      wallet.balance -= transaction.amount;
      wallet.transactions.push({
        id: transaction.id,
        type: 'debit',
        amount: transaction.amount,
        timestamp: new Date().toISOString()
      });
      
      return {
        success: true,
        providerId: `wallet_${transaction.userId}`,
        message: 'Wallet payment successful',
        response: {
          newBalance: wallet.balance,
          timestamp: new Date().toISOString()
        }
      };
    } else {
      return {
        success: false,
        message: 'Insufficient wallet balance',
        error: 'Insufficient funds'
      };
    }
  }

  async chargeWallet(userId, amount, paymentMethodId) {
    const wallet = this.getWallet(userId);
    
    // Simulate charging wallet from external payment method
    const success = Math.random() > 0.05; // 95% success rate
    
    if (success) {
      wallet.balance += amount;
      wallet.transactions.push({
        id: crypto.randomBytes(8).toString('hex'),
        type: 'credit',
        amount: amount,
        paymentMethodId,
        timestamp: new Date().toISOString()
      });
    }
    
    return {
      success,
      message: success ? 'Wallet charged successfully' : 'Failed to charge wallet',
      data: success ? { newBalance: wallet.balance } : null
    };
  }

  async getBalance(userId) {
    const wallet = this.getWallet(userId);
    return {
      balance: wallet.balance,
      currency: 'USD'
    };
  }

  async validatePaymentDetails(details) {
    return true; // Wallet doesn't need additional validation
  }

  async processRefund(originalTransaction, amount) {
    const wallet = this.getWallet(originalTransaction.userId);
    wallet.balance += amount;
    
    wallet.transactions.push({
      id: crypto.randomBytes(8).toString('hex'),
      type: 'refund',
      amount: amount,
      originalTransactionId: originalTransaction.id,
      timestamp: new Date().toISOString()
    });
    
    return {
      success: true,
      message: 'Wallet refund completed'
    };
  }

  getWallet(userId) {
    if (!this.wallets.has(userId)) {
      this.wallets.set(userId, {
        userId,
        balance: 0,
        transactions: []
      });
    }
    return this.wallets.get(userId);
  }
}

// Export the service
module.exports = PaymentService;

// Start the service if this file is run directly
if (require.main === module) {
  const paymentService = new PaymentService();
  paymentService.start();
}
