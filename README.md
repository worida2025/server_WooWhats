# WooWhats SaaS Platform

A comprehensive WhatsApp Business Integration SaaS platform with admin panel, client panel, and Stripe payment integration.

## 🚀 Features

### Admin Panel
- **User Management**: Create, edit, delete, and manage users
- **Subscription Management**: View and manage user subscriptions 
- **Analytics Dashboard**: Real-time statistics and metrics
- **Message Monitoring**: Track all messages sent through the platform
- **System Settings**: Configure platform settings and integrations
- **Role-based Access Control**: Admin and client roles with different permissions

### Client Panel  
- **WhatsApp Messaging**: Send messages with subscription limits
- **Subscription Management**: View usage, upgrade plans, manage billing
- **Message History**: Track all sent messages
- **Account Management**: Update profile and view account details
- **Billing Integration**: Stripe payment processing and invoice access

### Payment Integration
- **Stripe Integration**: Secure payment processing
- **Multiple Plans**: Starter ($9.99), Professional ($29.99), Enterprise ($99.99)
- **Subscription Management**: Automatic billing, cancellation, upgrades
- **Usage Tracking**: Monitor message limits and usage
- **Customer Portal**: Self-service billing management

### WhatsApp Integration
- **WhatsApp Web Integration**: Send messages via WhatsApp Business API
- **QR Code Authentication**: Easy setup and connection
- **Auto-reconnection**: Robust connection management
- **Message Delivery**: Track message status and delivery

## 🛠️ Technology Stack

- **Backend**: Node.js with Express.js
- **Database**: SQLite with automatic migrations
- **Authentication**: Session-based with bcrypt password hashing
- **Payments**: Stripe API integration
- **WhatsApp**: whatsapp-web.js library
- **Frontend**: Vanilla JavaScript with responsive design
- **Deployment**: Optimized for Render.com

## 📦 Installation & Setup

### Prerequisites
- Node.js 18+ 
- npm or yarn package manager
- Stripe account (for payments)

### Environment Variables

Create a `.env` file with the following variables:

```env
# Server Configuration
NODE_ENV=production
PORT=10000
SESSION_SECRET=your-secure-session-secret

# WhatsApp Configuration  
MAX_RECONNECT_ATTEMPTS=5
WHATSAPP_SESSION_PATH=/tmp/wwebjs_auth

# CORS Configuration
ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com

# Stripe Configuration (for payment processing)
STRIPE_PUBLISHABLE_KEY=pk_live_your_stripe_publishable_key
STRIPE_SECRET_KEY=sk_live_your_stripe_secret_key  
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret
```

### Local Development

```bash
# Clone the repository
git clone <repository-url>
cd server_WooWhats

# Install dependencies
npm install

# Start the development server
npm start
```

The server will start on port 3000 (or PORT environment variable).

### Deployment to Render

1. Create a new Web Service on Render
2. Connect your GitHub repository
3. Set build command: `npm install`
4. Set start command: `npm start`
5. Add environment variables in Render dashboard
6. Deploy!

## 👥 Demo Accounts

The platform includes demo accounts for testing:

- **Admin Account**: `admin` / `demo123`
- **Client Account**: `client` / `demo123`

## 🔧 API Endpoints

### Authentication
- `POST /auth/login` - User login
- `POST /auth/register` - User registration  
- `GET /auth/logout` - User logout

### User API
- `GET /api/user/profile` - Get user profile
- `GET /api/user/messages` - Get user message history

### Admin API (Admin Only)
- `GET /api/admin/stats` - Platform statistics
- `GET /api/admin/users` - List all users
- `POST /api/admin/users` - Create new user
- `PUT /api/admin/users/:id` - Update user
- `DELETE /api/admin/users/:id` - Delete user

### WhatsApp API
- `POST /api/send` - Send WhatsApp message (requires active subscription)
- `GET /status` - WhatsApp connection status
- `GET /qr` - Get QR code for authentication

### Stripe API
- `POST /api/stripe/create-subscription` - Create subscription
- `POST /api/stripe/customer-portal` - Access customer portal
- `POST /webhook/stripe` - Stripe webhook handler

## 💳 Subscription Plans

### Starter - $9.99/month
- 1,000 messages/month
- Basic support
- WhatsApp integration
- Message history

### Professional - $29.99/month (Recommended)
- 5,000 messages/month  
- Priority support
- Advanced analytics
- Custom templates
- Message scheduling

### Enterprise - $99.99/month
- 25,000 messages/month
- 24/7 support
- Advanced analytics
- Custom templates
- API access
- Dedicated support

## 🔒 Security Features

- **Session-based Authentication**: Secure user sessions
- **Password Hashing**: bcrypt encryption for passwords
- **Role-based Access Control**: Admin and client permissions
- **Rate Limiting**: API request rate limiting
- **CORS Protection**: Configurable CORS origins
- **Input Validation**: Server-side validation for all inputs

## 🎨 User Interface

The platform features a modern, responsive design with:

- **WhatsApp Brand Colors**: Green theme matching WhatsApp
- **Mobile-first Design**: Responsive layout for all devices
- **Intuitive Navigation**: Easy-to-use admin and client panels
- **Real-time Updates**: Live status updates and notifications
- **Professional Styling**: Clean, modern interface

## 📊 Database Schema

The platform uses SQLite with the following tables:

- **users**: User accounts and profile information
- **subscriptions**: Subscription plans and usage tracking
- **messages**: Message history and delivery status
- **payment_history**: Payment transactions and billing records

## 🔗 Integration Guide

### Stripe Webhook Setup

1. Create a webhook endpoint in Stripe dashboard
2. Point to: `https://yourdomain.com/webhook/stripe`
3. Select events: `invoice.payment_succeeded`, `invoice.payment_failed`, `customer.subscription.deleted`, `customer.subscription.updated`
4. Copy webhook secret to environment variables

### WhatsApp Setup

1. Access the admin panel
2. Navigate to WhatsApp settings
3. Scan QR code with WhatsApp Business mobile app
4. Platform will automatically connect and manage sessions

## 📈 Monitoring & Analytics

The admin dashboard provides:

- **User Growth**: Track new user registrations
- **Revenue Metrics**: Monitor monthly recurring revenue
- **Usage Statistics**: Message volume and platform usage
- **Subscription Analytics**: Active subscriptions and churn rates

## 🚨 Production Checklist

- [ ] Set secure `SESSION_SECRET` environment variable
- [ ] Configure production Stripe keys
- [ ] Set up proper CORS origins
- [ ] Enable HTTPS/SSL
- [ ] Configure webhook endpoints
- [ ] Set up monitoring and alerts
- [ ] Configure backup strategy for database
- [ ] Set up proper logging

## 🆘 Support & Documentation

For support and additional documentation:

- Check the admin panel settings for system status
- Monitor server logs for troubleshooting
- Verify Stripe webhook configuration
- Ensure WhatsApp connection is active

## 📄 License

MIT License

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

---

Built with ❤️ for WhatsApp Business Integration
