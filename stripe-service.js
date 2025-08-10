const Stripe = require('stripe');
const database = require('./database');

class StripeService {
  constructor() {
    this.stripe = null;
    this.webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    this.init();
  }

  init() {
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (stripeKey) {
      this.stripe = new Stripe(stripeKey);
      console.log('Stripe initialized successfully');
    } else {
      console.warn('Stripe not initialized - STRIPE_SECRET_KEY not found in environment');
    }
  }

  isEnabled() {
    return this.stripe !== null;
  }

  // Subscription plans configuration
  getPlans() {
    return [
      {
        id: 'starter',
        name: 'Starter Plan',
        price: 9.99,
        currency: 'USD',
        interval: 'month',
        messages_limit: 1000,
        features: ['1,000 messages/month', 'Basic support', 'WhatsApp integration']
      },
      {
        id: 'professional',
        name: 'Professional Plan',
        price: 29.99,
        currency: 'USD',
        interval: 'month',
        messages_limit: 5000,
        features: ['5,000 messages/month', 'Priority support', 'Advanced analytics', 'Custom templates']
      },
      {
        id: 'enterprise',
        name: 'Enterprise Plan',
        price: 99.99,
        currency: 'USD',
        interval: 'month',
        messages_limit: 25000,
        features: ['25,000 messages/month', '24/7 support', 'Advanced analytics', 'Custom templates', 'API access']
      }
    ];
  }

  // Create Stripe customer
  async createCustomer(user) {
    if (!this.isEnabled()) {
      throw new Error('Stripe is not configured');
    }

    try {
      const customer = await this.stripe.customers.create({
        email: user.email,
        name: user.username,
        metadata: {
          user_id: user.id,
          username: user.username
        }
      });

      return customer;
    } catch (error) {
      console.error('Error creating Stripe customer:', error);
      throw error;
    }
  }

  // Create subscription
  async createSubscription(userId, planId, paymentMethodId) {
    if (!this.isEnabled()) {
      throw new Error('Stripe is not configured');
    }

    try {
      const user = await database.getUser(userId);
      if (!user) {
        throw new Error('User not found');
      }

      const plan = this.getPlans().find(p => p.id === planId);
      if (!plan) {
        throw new Error('Plan not found');
      }

      // Create or get customer
      let customer;
      if (user.stripe_customer_id) {
        customer = await this.stripe.customers.retrieve(user.stripe_customer_id);
      } else {
        customer = await this.createCustomer(user);
      }

      // Attach payment method to customer
      await this.stripe.paymentMethods.attach(paymentMethodId, {
        customer: customer.id,
      });

      // Set as default payment method
      await this.stripe.customers.update(customer.id, {
        invoice_settings: {
          default_payment_method: paymentMethodId,
        },
      });

      // Create price if it doesn't exist
      const price = await this.createOrGetPrice(plan);

      // Create subscription
      const subscription = await this.stripe.subscriptions.create({
        customer: customer.id,
        items: [{ price: price.id }],
        payment_behavior: 'default_incomplete',
        payment_settings: { save_default_payment_method: 'on_subscription' },
        expand: ['latest_invoice.payment_intent'],
        metadata: {
          user_id: userId,
          plan_id: planId
        }
      });

      // Save subscription to database
      await database.createSubscription({
        user_id: userId,
        plan_name: plan.name,
        plan_price: plan.price,
        stripe_subscription_id: subscription.id,
        stripe_customer_id: customer.id,
        messages_limit: plan.messages_limit
      });

      // Update user subscription status
      await database.updateUser(userId, {
        subscription_status: 'active',
        subscription_plan: plan.name
      });

      return {
        subscription,
        client_secret: subscription.latest_invoice.payment_intent.client_secret
      };
    } catch (error) {
      console.error('Error creating subscription:', error);
      throw error;
    }
  }

  // Create or get price for a plan
  async createOrGetPrice(plan) {
    try {
      // Try to find existing price
      const prices = await this.stripe.prices.list({
        lookup_keys: [plan.id],
        expand: ['data.product']
      });

      if (prices.data.length > 0) {
        return prices.data[0];
      }

      // Create new price
      const price = await this.stripe.prices.create({
        unit_amount: Math.round(plan.price * 100), // Convert to cents
        currency: plan.currency.toLowerCase(),
        recurring: { interval: plan.interval },
        product_data: {
          name: plan.name,
          description: plan.features.join(', ')
        },
        lookup_key: plan.id
      });

      return price;
    } catch (error) {
      console.error('Error creating/getting price:', error);
      throw error;
    }
  }

  // Cancel subscription
  async cancelSubscription(subscriptionId) {
    if (!this.isEnabled()) {
      throw new Error('Stripe is not configured');
    }

    try {
      const subscription = await this.stripe.subscriptions.update(subscriptionId, {
        cancel_at_period_end: true
      });

      // Update database
      await database.updateSubscription(subscriptionId, {
        status: 'cancelled'
      });

      return subscription;
    } catch (error) {
      console.error('Error cancelling subscription:', error);
      throw error;
    }
  }

  // Handle webhook events
  async handleWebhook(payload, signature) {
    if (!this.isEnabled() || !this.webhookSecret) {
      console.warn('Stripe webhook received but not configured');
      return;
    }

    let event;

    try {
      event = this.stripe.webhooks.constructEvent(payload, signature, this.webhookSecret);
    } catch (err) {
      console.error('Webhook signature verification failed:', err.message);
      throw err;
    }

    console.log('Received Stripe webhook:', event.type);

    switch (event.type) {
      case 'invoice.payment_succeeded':
        await this.handlePaymentSucceeded(event.data.object);
        break;
      case 'invoice.payment_failed':
        await this.handlePaymentFailed(event.data.object);
        break;
      case 'customer.subscription.deleted':
        await this.handleSubscriptionDeleted(event.data.object);
        break;
      case 'customer.subscription.updated':
        await this.handleSubscriptionUpdated(event.data.object);
        break;
      default:
        console.log(`Unhandled event type: ${event.type}`);
    }
  }

  async handlePaymentSucceeded(invoice) {
    try {
      const subscription = await this.stripe.subscriptions.retrieve(invoice.subscription);
      const userId = subscription.metadata.user_id;

      if (userId) {
        // Update subscription status
        await database.updateUser(userId, {
          subscription_status: 'active'
        });

        // Reset message usage for new period
        const dbSubscription = await database.getUserSubscription(userId);
        if (dbSubscription) {
          await database.updateSubscription(dbSubscription.id, {
            messages_used: 0,
            current_period_end: subscription.current_period_end
          });
        }

        console.log(`Payment succeeded for user ${userId}`);
      }
    } catch (error) {
      console.error('Error handling payment succeeded:', error);
    }
  }

  async handlePaymentFailed(invoice) {
    try {
      const subscription = await this.stripe.subscriptions.retrieve(invoice.subscription);
      const userId = subscription.metadata.user_id;

      if (userId) {
        await database.updateUser(userId, {
          subscription_status: 'past_due'
        });

        console.log(`Payment failed for user ${userId}`);
      }
    } catch (error) {
      console.error('Error handling payment failed:', error);
    }
  }

  async handleSubscriptionDeleted(subscription) {
    try {
      const userId = subscription.metadata.user_id;

      if (userId) {
        await database.updateUser(userId, {
          subscription_status: 'cancelled'
        });

        // Update subscription in database
        const dbSubscription = await database.getUserSubscription(userId);
        if (dbSubscription) {
          await database.updateSubscription(dbSubscription.id, {
            status: 'cancelled'
          });
        }

        console.log(`Subscription cancelled for user ${userId}`);
      }
    } catch (error) {
      console.error('Error handling subscription deleted:', error);
    }
  }

  async handleSubscriptionUpdated(subscription) {
    try {
      const userId = subscription.metadata.user_id;

      if (userId) {
        let status = 'active';
        if (subscription.status === 'past_due') status = 'past_due';
        else if (subscription.status === 'canceled') status = 'cancelled';
        else if (subscription.status === 'unpaid') status = 'past_due';

        await database.updateUser(userId, {
          subscription_status: status
        });

        console.log(`Subscription updated for user ${userId}: ${status}`);
      }
    } catch (error) {
      console.error('Error handling subscription updated:', error);
    }
  }

  // Get customer portal URL for managing subscription
  async getCustomerPortalUrl(customerId, returnUrl) {
    if (!this.isEnabled()) {
      throw new Error('Stripe is not configured');
    }

    try {
      const session = await this.stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: returnUrl,
      });

      return session.url;
    } catch (error) {
      console.error('Error creating customer portal session:', error);
      throw error;
    }
  }
}

module.exports = new StripeService();