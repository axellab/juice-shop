/*
 * Arauco Demo - Order Payment Integration
 * This module demonstrates how to integrate the payment microservice
 * with the existing Juice Shop order processing flow.
 */

const PaymentServiceClient = require('./payment-client');
const { EventEmitter } = require('events');

class OrderPaymentIntegration extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.paymentClient = new PaymentServiceClient({
      baseURL: options.paymentServiceUrl || 'http://localhost:3001',
      timeout: options.timeout || 30000
    });

    this.setupPaymentEventListeners();
  }

  setupPaymentEventListeners() {
    this.paymentClient.on('payment_initiated', (data) => {
      console.log(`Payment initiated for order ${data.orderId}: ${data.transactionId}`);
      this.emit('payment_started', data);
    });

    this.paymentClient.on('payment_failed', (data) => {
      console.error(`Payment failed for order ${data.orderId}: ${data.error}`);
      this.emit('payment_error', data);
    });

    this.paymentClient.on('wallet_charged', (data) => {
      console.log(`Wallet charged for user ${data.userId}: $${data.amount}`);
      this.emit('wallet_updated', data);
    });
  }

  /**
   * Process an order payment using the payment microservice
   * This would replace or extend the existing order processing in routes/order.ts
   */
  async processOrderPayment(orderData) {
    try {
      const {
        orderId,
        userId,
        basketItems,
        totalPrice,
        paymentMethod,
        paymentDetails,
        addressId,
        deliveryMethodId
      } = orderData;

      console.log(`Processing payment for order ${orderId}, amount: $${totalPrice}`);

      // Step 1: Validate payment details
      const validation = await this.paymentClient.validatePayment(paymentMethod, paymentDetails);
      if (!validation.valid) {
        return {
          success: false,
          error: 'Invalid payment details',
          details: validation.errors
        };
      }

      // Step 2: Calculate final amount (including taxes, delivery, discounts)
      const finalAmount = await this.calculateFinalAmount(basketItems, totalPrice, deliveryMethodId);

      // Step 3: Create payment session for complex flows
      const session = await this.paymentClient.createPaymentSession({
        orderId,
        userId,
        amount: finalAmount.total,
        currency: 'USD',
        items: basketItems,
        metadata: {
          addressId,
          deliveryMethodId,
          originalAmount: totalPrice,
          taxes: finalAmount.taxes,
          deliveryFee: finalAmount.deliveryFee,
          discounts: finalAmount.discounts
        }
      });

      if (!session.success) {
        return {
          success: false,
          error: 'Failed to create payment session'
        };
      }

      // Step 4: Process the payment
      const paymentResult = await this.paymentClient.completePaymentSession(session.sessionId, {
        paymentMethod,
        paymentDetails,
        finalAmount: finalAmount.total
      });

      if (!paymentResult.success) {
        // Log payment failure
        console.error(`Payment failed for order ${orderId}:`, paymentResult.error);
        
        // Emit failure event for order cleanup
        this.emit('order_payment_failed', {
          orderId,
          userId,
          error: paymentResult.error,
          transactionId: paymentResult.transactionId
        });

        return {
          success: false,
          error: paymentResult.error,
          transactionId: paymentResult.transactionId
        };
      }

      // Step 5: Update order status and emit success event
      console.log(`Payment successful for order ${orderId}: ${paymentResult.transactionId}`);
      
      this.emit('order_payment_completed', {
        orderId,
        userId,
        transactionId: paymentResult.transactionId,
        amount: finalAmount.total,
        paymentMethod,
        timestamp: new Date().toISOString()
      });

      return {
        success: true,
        transactionId: paymentResult.transactionId,
        orderId,
        amount: finalAmount.total,
        paymentMethod,
        message: 'Payment processed successfully'
      };

    } catch (error) {
      console.error(`Order payment processing error for order ${orderData.orderId}:`, error);
      
      this.emit('order_payment_error', {
        orderId: orderData.orderId,
        userId: orderData.userId,
        error: error.message
      });

      return {
        success: false,
        error: 'Payment processing system error',
        details: error.message
      };
    }
  }

  /**
   * Handle wallet payments specifically
   */
  async processWalletPayment(orderData) {
    try {
      const { orderId, userId, totalPrice } = orderData;

      // Check wallet balance first
      const walletBalance = await this.paymentClient.getWalletBalance(userId);
      
      if (!walletBalance.success) {
        return {
          success: false,
          error: 'Unable to verify wallet balance'
        };
      }

      if (walletBalance.balance < totalPrice) {
        return {
          success: false,
          error: 'Insufficient wallet balance',
          currentBalance: walletBalance.balance,
          required: totalPrice
        };
      }

      // Process wallet payment
      const paymentResult = await this.paymentClient.processPayment({
        orderId,
        userId,
        amount: totalPrice,
        currency: 'USD',
        paymentMethod: 'wallet',
        paymentDetails: { walletId: userId }
      });

      return paymentResult;

    } catch (error) {
      console.error(`Wallet payment error for order ${orderData.orderId}:`, error);
      return {
        success: false,
        error: 'Wallet payment processing error'
      };
    }
  }

  /**
   * Charge wallet from credit card or other payment method
   */
  async chargeUserWallet(userId, amount, paymentMethodId, paymentDetails) {
    try {
      // First validate the payment method
      const validation = await this.paymentClient.validatePayment('credit_card', paymentDetails);
      
      if (!validation.valid) {
        return {
          success: false,
          error: 'Invalid payment method for wallet charge',
          details: validation.errors
        };
      }

      // Charge the wallet
      const chargeResult = await this.paymentClient.chargeWallet(userId, amount, paymentMethodId);
      
      if (chargeResult.success) {
        this.emit('wallet_charged', {
          userId,
          amount,
          paymentMethodId,
          newBalance: chargeResult.data?.newBalance
        });
      }

      return chargeResult;

    } catch (error) {
      console.error(`Wallet charge error for user ${userId}:`, error);
      return {
        success: false,
        error: 'Wallet charge processing error'
      };
    }
  }

  /**
   * Process order refund
   */
  async processOrderRefund(orderId, transactionId, amount, reason) {
    try {
      console.log(`Processing refund for order ${orderId}, transaction ${transactionId}`);

      const refundResult = await this.paymentClient.processRefund(transactionId, amount, reason);

      if (refundResult.success) {
        this.emit('order_refunded', {
          orderId,
          transactionId,
          refundId: refundResult.refundId,
          amount,
          reason,
          timestamp: new Date().toISOString()
        });

        console.log(`Refund processed for order ${orderId}: ${refundResult.refundId}`);
      } else {
        console.error(`Refund failed for order ${orderId}:`, refundResult.error);
      }

      return refundResult;

    } catch (error) {
      console.error(`Refund processing error for order ${orderId}:`, error);
      return {
        success: false,
        error: 'Refund processing system error'
      };
    }
  }

  /**
   * Get payment history for a user's orders
   */
  async getUserPaymentHistory(userId, options = {}) {
    try {
      const history = await this.paymentClient.getPaymentHistory(userId, options);
      
      if (history.success) {
        // Enrich with order information if needed
        const enrichedTransactions = history.data.transactions.map(transaction => ({
          ...transaction,
          // Add any additional order-specific information here
          juiceShopOrderUrl: `/orders/${transaction.orderId}`
        }));

        return {
          success: true,
          data: {
            ...history.data,
            transactions: enrichedTransactions
          }
        };
      }

      return history;

    } catch (error) {
      console.error(`Error getting payment history for user ${userId}:`, error);
      return {
        success: false,
        error: 'Unable to retrieve payment history'
      };
    }
  }

  /**
   * Calculate final order amount including taxes, delivery, discounts
   */
  async calculateFinalAmount(basketItems, baseAmount, deliveryMethodId) {
    // This would integrate with existing Juice Shop calculation logic
    const calculations = {
      baseAmount: parseFloat(baseAmount),
      taxes: 0,
      deliveryFee: 0,
      discounts: 0,
      total: 0
    };

    // Calculate taxes (example: 8.25% tax rate)
    calculations.taxes = calculations.baseAmount * 0.0825;

    // Calculate delivery fee (this would fetch from delivery method)
    if (deliveryMethodId) {
      // Mock delivery fee calculation
      calculations.deliveryFee = deliveryMethodId === '1' ? 5.99 : 
                               deliveryMethodId === '2' ? 2.99 : 
                               deliveryMethodId === '3' ? 9.99 : 0;
    }

    // Apply discounts (this would integrate with coupon system)
    // calculations.discounts = await this.calculateDiscounts(basketItems);

    // Calculate final total
    calculations.total = calculations.baseAmount + calculations.taxes + calculations.deliveryFee - calculations.discounts;

    return calculations;
  }

  /**
   * Validate order before payment processing
   */
  async validateOrderForPayment(orderData) {
    const errors = [];

    if (!orderData.orderId) {
      errors.push('Order ID is required');
    }

    if (!orderData.userId) {
      errors.push('User ID is required');
    }

    if (!orderData.totalPrice || orderData.totalPrice <= 0) {
      errors.push('Valid total price is required');
    }

    if (!orderData.paymentMethod) {
      errors.push('Payment method is required');
    }

    if (!orderData.basketItems || orderData.basketItems.length === 0) {
      errors.push('Order must contain items');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Get payment service health status
   */
  async getPaymentServiceHealth() {
    return await this.paymentClient.healthCheck();
  }

  /**
   * Get payment analytics for admin dashboard
   */
  async getPaymentAnalytics() {
    return await this.paymentClient.getPaymentAnalytics();
  }
}

module.exports = OrderPaymentIntegration;
