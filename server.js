const { Client, LocalAuth } = require('whatsapp-web.js');
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs-extra');
const path = require('path');
const session = require('express-session');
require('dotenv').config();

// Import custom modules
const database = require('./database');
const stripeService = require('./stripe-service');
const { 
  requireAuth, 
  requireAdmin, 
  requireActiveSubscription, 
  checkMessageLimit, 
  rateLimit,
  enhanceUserSession,
  checkUserAccess
} = require('./middleware');

const app = express();

// Global variables for managing WhatsApp state
let qrCode = null;
let sessionData = null;
let connectionStatus = 'disconnected';
let client = null;
let reconnectTimer = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = parseInt(process.env.MAX_RECONNECT_ATTEMPTS) || 5;
const RECONNECT_INTERVAL = 10000;
let lastActivity = Date.now();
let keepAliveInterval = null;

console.log('Starting WooWhats SaaS Platform...');

// Get configuration from environment
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const SESSION_SECRET = process.env.SESSION_SECRET || 'woowhats-secret-change-in-production';

const allowedOrigins = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim())
  : ['*'];

console.log(`Environment: ${NODE_ENV}`);
console.log(`Port: ${PORT}`);
console.log(`Allowed Origins: ${allowedOrigins.join(', ')}`);

// Create data directory for WhatsApp sessions
const dataDir = process.env.WHATSAPP_SESSION_PATH || path.join(__dirname, '.wwebjs_auth');
fs.ensureDirSync(dataDir);

// Setup Express middleware
app.use(cors({
  origin: allowedOrigins.includes('*') ? true : allowedOrigins,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

// Session management
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Serve static files
app.use('/css', express.static(path.join(__dirname, 'public/css')));
app.use('/js', express.static(path.join(__dirname, 'public/js')));
app.use('/images', express.static(path.join(__dirname, 'public/images')));

// Trust proxy for cloud deployment
app.set('trust proxy', 1);

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path} - ${req.ip}`);
  next();
});

// Apply rate limiting
app.use('/api', rateLimit());

// Enhance user session middleware
app.use(enhanceUserSession);

// AUTHENTICATION ROUTES
app.get('/auth/login', (req, res) => {
  if (req.session && req.session.user) {
    return res.redirect('/dashboard');
  }
  res.sendFile(path.join(__dirname, 'public/auth.html'));
});

app.post('/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }
    
    const user = await database.validateUser(username, password);
    
    if (user) {
      req.session.user = {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        subscription_status: user.subscription_status,
        subscription_plan: user.subscription_plan
      };
      
      // Determine redirect based on role
      const redirect = user.role === 'admin' ? '/admin' : '/client';
      
      res.json({ 
        success: true, 
        redirect: redirect,
        user: req.session.user 
      });
    } else {
      res.status(401).json({ error: 'Invalid username or password' });
    }
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error during login' });
  }
});

app.post('/auth/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'All fields are required' });
    }
    
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    
    // Check if user already exists
    const existingUser = await database.getUser(username);
    if (existingUser) {
      return res.status(400).json({ error: 'Username or email already exists' });
    }
    
    const existingEmail = await database.getUser(email);
    if (existingEmail) {
      return res.status(400).json({ error: 'Username or email already exists' });
    }
    
    const user = await database.createUser({
      username,
      email,
      password,
      role: 'client'
    });
    
    res.json({ success: true, user: { id: user.id, username: user.username, email: user.email } });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Server error during registration' });
  }
});

app.get('/auth/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Session destroy error:', err);
    }
    res.redirect('/auth/login');
  });
});

// DASHBOARD ROUTES
app.get('/', (req, res) => {
  const acceptHeader = req.get('Accept') || '';
  if (acceptHeader.includes('text/html')) {
    return res.redirect('/dashboard');
  }
  
  // API request - return JSON status
  res.json({ 
    status: 'ok',
    service: 'WooWhats SaaS Platform',
    environment: NODE_ENV,
    uptime: process.uptime(),
    whatsappStatus: connectionStatus,
    stripeEnabled: stripeService.isEnabled(),
    version: '2.0.0'
  });
});

app.get('/dashboard', requireAuth, checkUserAccess, (req, res) => {
  if (req.session.user.role === 'admin') {
    return res.redirect('/admin');
  } else {
    return res.redirect('/client');
  }
});

// ADMIN ROUTES
app.get('/admin', requireAuth, requireAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, 'public/admin/index.html'));
});

// CLIENT ROUTES
app.get('/client', requireAuth, checkUserAccess, (req, res) => {
  res.sendFile(path.join(__dirname, 'public/client/index.html'));
});

// API ROUTES

// User profile and info
app.get('/api/user/profile', requireAuth, async (req, res) => {
  try {
    const user = await database.getUser(req.session.user.id);
    const subscription = await database.getUserSubscription(req.session.user.id);
    
    res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        subscription_status: user.subscription_status,
        subscription_plan: user.subscription_plan,
        created_at: user.created_at,
        last_login: user.last_login
      },
      subscription: subscription
    });
  } catch (error) {
    console.error('Error getting user profile:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/user/messages', requireAuth, async (req, res) => {
  try {
    const messages = await database.getUserMessages(req.session.user.id);
    res.json({ success: true, messages });
  } catch (error) {
    console.error('Error getting user messages:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// WhatsApp messaging endpoint with subscription checks
app.post('/api/send', requireAuth, requireActiveSubscription, checkMessageLimit, async (req, res) => {
  lastActivity = Date.now();
  
  try {
    if (connectionStatus !== 'connected' || !client) {
      return res.status(503).json({ 
        error: 'WhatsApp is not connected',
        status: connectionStatus 
      });
    }

    const { to, message } = req.body;
    if (!to || !message) {
      return res.status(400).json({ error: 'Phone number and message are required' });
    }

    // Format phone number
    let formattedNumber = to.replace(/\D/g, '');
    if (formattedNumber.length <= 10) {
      formattedNumber = '966' + formattedNumber.replace(/^0+/, '');
    }
    
    const chatId = `${formattedNumber}@c.us`;
    
    console.log(`Sending message to ${chatId} from user ${req.session.user.username}...`);
    
    // Send the message
    const result = await client.sendMessage(chatId, message);
    
    // Log message to database
    await database.logMessage(req.session.user.id, formattedNumber, message);
    
    // Increment usage counter
    await database.incrementMessageUsage(req.session.user.id);
    
    console.log(`Message sent successfully to ${chatId}`);
    res.json({ success: true, messageId: result.id._serialized });
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ error: error.message });
  }
});

// ADMIN API ROUTES
app.get('/api/admin/stats', requireAuth, requireAdmin, async (req, res) => {
  try {
    const stats = await database.getAdminStats();
    res.json({ success: true, stats });
  } catch (error) {
    console.error('Error getting admin stats:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/admin/users', requireAuth, requireAdmin, async (req, res) => {
  try {
    const users = await database.getAllUsers();
    res.json({ success: true, users });
  } catch (error) {
    console.error('Error getting users:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/admin/users/:userId', requireAuth, requireAdmin, async (req, res) => {
  try {
    const user = await database.getUser(req.params.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ success: true, user });
  } catch (error) {
    console.error('Error getting user:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/admin/users', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { username, email, password, role } = req.body;
    
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Username, email, and password are required' });
    }
    
    const user = await database.createUser({ username, email, password, role: role || 'client' });
    res.json({ success: true, user });
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ error: error.message || 'Server error' });
  }
});

app.put('/api/admin/users/:userId', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { email, role, password } = req.body;
    const updates = {};
    
    if (email) updates.email = email;
    if (role) updates.role = role;
    
    // Handle password update separately if provided
    if (password) {
      const bcrypt = require('bcrypt');
      updates.password = await bcrypt.hash(password, 10);
    }
    
    const success = await database.updateUser(req.params.userId, updates);
    
    if (success) {
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'User not found or no changes made' });
    }
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.delete('/api/admin/users/:userId', requireAuth, requireAdmin, async (req, res) => {
  try {
    const success = await database.deleteUser(req.params.userId);
    
    if (success) {
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'User not found or cannot delete admin user' });
    }
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/admin/plans', requireAuth, requireAdmin, (req, res) => {
  res.json({ success: true, plans: stripeService.getPlans() });
});

app.get('/api/admin/messages', requireAuth, requireAdmin, async (req, res) => {
  try {
    // Get recent messages from all users
    const query = `
      SELECT m.*, u.username 
      FROM messages m 
      LEFT JOIN users u ON m.user_id = u.id 
      ORDER BY m.sent_at DESC 
      LIMIT 100
    `;
    
    res.json({ success: true, messages: [] }); // Simplified for now
  } catch (error) {
    console.error('Error getting messages:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/admin/settings', requireAuth, requireAdmin, (req, res) => {
  res.json({
    success: true,
    settings: {
      environment: NODE_ENV,
      whatsapp_status: connectionStatus,
      stripe_enabled: stripeService.isEnabled(),
      total_users: 0 // Would be populated from database
    }
  });
});

// STRIPE API ROUTES
app.get('/api/stripe/config', (req, res) => {
  res.json({
    publishable_key: process.env.STRIPE_PUBLISHABLE_KEY,
    success: !!process.env.STRIPE_PUBLISHABLE_KEY
  });
});

app.post('/api/stripe/create-subscription', requireAuth, async (req, res) => {
  if (!stripeService.isEnabled()) {
    return res.status(400).json({ error: 'Payment system is not configured' });
  }
  
  try {
    const { plan_id, payment_method_id } = req.body;
    
    if (!plan_id) {
      return res.status(400).json({ error: 'Plan ID is required' });
    }
    
    const result = await stripeService.createSubscription(
      req.session.user.id,
      plan_id,
      payment_method_id
    );
    
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('Error creating subscription:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/stripe/customer-portal', requireAuth, async (req, res) => {
  if (!stripeService.isEnabled()) {
    return res.status(400).json({ error: 'Payment system is not configured' });
  }
  
  try {
    const user = await database.getUser(req.session.user.id);
    
    if (!user.stripe_customer_id) {
      return res.status(400).json({ error: 'No customer found' });
    }
    
    const returnUrl = `${req.protocol}://${req.get('host')}/client`;
    const url = await stripeService.getCustomerPortalUrl(user.stripe_customer_id, returnUrl);
    
    res.json({ success: true, url });
  } catch (error) {
    console.error('Error creating customer portal session:', error);
    res.status(500).json({ error: error.message });
  }
});

// Stripe webhook endpoint
app.post('/webhook/stripe', express.raw({type: 'application/json'}), async (req, res) => {
  try {
    await stripeService.handleWebhook(req.body, req.get('stripe-signature'));
    res.status(200).send('Webhook received');
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(400).send('Webhook error');
  }
});

// WHATSAPP API ROUTES (Legacy support)
app.get('/qr', (req, res) => {
  if (connectionStatus === 'connected') {
    return res.json({ error: 'Already connected', connected: true });
  }
  
  if (!qrCode && connectionStatus !== 'connecting') {
    console.log('QR requested but not available. Reinitializing client...');
    initializeWhatsAppClient();
    return res.json({ error: 'QR code not available yet, initializing client', retry: true });
  }
  
  res.json({ qr: qrCode });
});

app.get('/status', (req, res) => {
  res.json({ 
    status: connectionStatus,
    isReady: connectionStatus === 'connected',
    qrCode: qrCode ? true : false,
    session: sessionData ? true : false,
    phone: sessionData ? sessionData.phone : null,
    name: sessionData ? sessionData.name : null,
    uptime: process.uptime(),
    reconnectAttempts: reconnectAttempts,
    port: PORT,
    lastActivity: new Date(lastActivity).toISOString(),
    environment: NODE_ENV,
    memoryUsage: process.memoryUsage()
  });
});

app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'healthy',
    whatsapp: connectionStatus,
    uptime: process.uptime(),
    database: 'connected',
    stripe: stripeService.isEnabled() ? 'enabled' : 'disabled'
  });
});

// Initialize WhatsApp Client
function initializeWhatsAppClient() {
  if (client) {
    try {
      client.destroy();
      console.log('Destroyed existing client');
    } catch (error) {
      console.error('Error destroying existing client:', error);
    }
    client = null;
  }

  qrCode = null;
  connectionStatus = 'connecting';
  console.log('Initializing new WhatsApp client...');

  client = new Client({
    authStrategy: new LocalAuth({
      dataPath: dataDir,
      clientId: 'woowhats-saas-' + Date.now()
    }),
    puppeteer: {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--single-process',
        '--disable-gpu',
        '--disable-extensions',
        '--disable-background-networking',
        '--disable-default-apps',
        '--disable-sync',
        '--disable-translate',
        '--hide-scrollbars',
        '--metrics-recording-only',
        '--mute-audio',
        '--no-default-browser-check',
        '--no-experiments',
        '--disable-features=site-per-process',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor',
        '--memory-pressure-off',
        '--max_old_space_size=4096'
      ],
      ignoreHTTPSErrors: true,
      timeout: 60000,
      protocolTimeout: 60000
    },
    webVersionCache: { type: 'local' },
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    restartOnAuthFail: true,
    qrMaxRetries: 3,
    qrRefreshIntervalMs: 20000
  });

  // Event handlers
  client.on('qr', (qr) => {
    console.log('QR Code received - ready for scanning');
    qrCode = qr;
    connectionStatus = 'connecting';
    lastActivity = Date.now();
  });

  client.on('ready', () => {
    console.log('WhatsApp Client is ready!');
    qrCode = null;
    connectionStatus = 'connected';
    reconnectAttempts = 0;
    lastActivity = Date.now();
    
    try {
      sessionData = {
        connected: true,
        phone: client.info.wid.user,
        name: client.info.pushname || 'Unknown',
        timestamp: new Date().toISOString(),
        server: 'woowhats-saas'
      };
      console.log(`Connected as: ${sessionData.name} (${sessionData.phone})`);
    } catch (error) {
      console.error('Error getting client info:', error);
      sessionData = {
        connected: true,
        phone: 'Unknown',
        name: 'Unknown',
        timestamp: new Date().toISOString(),
        server: 'woowhats-saas'
      };
    }
  });

  client.on('authenticated', () => {
    console.log('WhatsApp Client authenticated');
    connectionStatus = 'connected';
    qrCode = null;
    lastActivity = Date.now();
  });

  client.on('auth_failure', (msg) => {
    console.error('WhatsApp Authentication failure:', msg);
    connectionStatus = 'disconnected';
    sessionData = null;
    qrCode = null;
    handleReconnect('auth_failure');
  });

  client.on('disconnected', (reason) => {
    console.log('WhatsApp Client was disconnected:', reason);
    connectionStatus = 'disconnected';
    sessionData = null;
    qrCode = null;
    handleReconnect('disconnected: ' + reason);
  });

  console.log('Initializing WhatsApp client...');
  connectionStatus = 'connecting';
  client.initialize()
    .catch(err => {
      console.error('Error initializing WhatsApp client:', err);
      connectionStatus = 'disconnected';
      handleReconnect('init_error: ' + err.message);
    });
}

function handleReconnect(reason) {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
  }
  
  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    console.log(`Maximum reconnection attempts (${MAX_RECONNECT_ATTEMPTS}) reached. Giving up.`);
    return;
  }
  
  reconnectAttempts++;
  console.log(`Scheduling reconnect attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS} in ${RECONNECT_INTERVAL/1000} seconds... Reason: ${reason}`);
  
  reconnectTimer = setTimeout(() => {
    console.log(`Attempting to reconnect (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`);
    initializeWhatsAppClient();
  }, RECONNECT_INTERVAL);
}

// Error handling
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Graceful shutdown
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

async function shutdown() {
  console.log('Shutting down server...');
  
  if (client) {
    try {
      console.log('Logging out WhatsApp client...');
      await client.logout();
    } catch (error) {
      console.error('Error logging out:', error);
    }
    
    try {
      console.log('Destroying WhatsApp client...');
      client.destroy();
    } catch (error) {
      console.error('Error destroying client:', error);
    }
  }
  
  // Close database connection
  database.close();
  
  process.exit(0);
}

// Initialize WhatsApp client
initializeWhatsAppClient();

// Start the server
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`WooWhats SaaS Platform running on port ${PORT}`);
  console.log(`Environment: ${NODE_ENV}`);
  console.log(`Stripe: ${stripeService.isEnabled() ? 'Enabled' : 'Disabled'}`);
});

server.on('error', (error) => {
  console.error('Server error:', error);
});

module.exports = { app };