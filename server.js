const { Client, LocalAuth } = require('whatsapp-web.js');
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs-extra');
const path = require('path');
require('dotenv').config();

const app = express();

// Global variables for managing state
let qrCode = null;
let sessionData = null;
let connectionStatus = 'disconnected'; // 'disconnected', 'connecting', 'connected'
let client = null;
let reconnectTimer = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = parseInt(process.env.MAX_RECONNECT_ATTEMPTS) || 5;
const RECONNECT_INTERVAL = 10000; // 10 seconds
let lastActivity = Date.now();
let keepAliveInterval = null;

console.log('Starting WooWhats WhatsApp Web Server for Render...');

// Get port from environment (Render sets this automatically)
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

// Get allowed origins from environment
const allowedOrigins = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim())
  : ['*'];

console.log(`Environment: ${NODE_ENV}`);
console.log(`Port: ${PORT}`);
console.log(`Allowed Origins: ${allowedOrigins.join(', ')}`);

// Create data directory for sessions (use temp directory on Render)
const dataDir = process.env.WHATSAPP_SESSION_PATH || path.join(__dirname, '.wwebjs_auth');
fs.ensureDirSync(dataDir);

console.log('Session data directory:', dataDir);

// Setup Express middleware with Render-optimized CORS
app.use(cors({
  origin: allowedOrigins.includes('*') ? true : allowedOrigins,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

// Trust proxy for Render
app.set('trust proxy', 1);

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path} - ${req.ip}`);
  next();
});

// Keep track of pending operations
let pendingOperations = [];

// Function to initialize the WhatsApp client
function initializeWhatsAppClient() {
  // Clear any existing client
  if (client) {
    try {
      client.destroy();
      console.log('Destroyed existing client');
    } catch (error) {
      console.error('Error destroying existing client:', error);
    }
    client = null;
  }

  // Reset state
  qrCode = null;
  connectionStatus = 'connecting';
  console.log('Initializing new WhatsApp client...');

  // Create new client instance optimized for cloud deployment
  client = new Client({
    authStrategy: new LocalAuth({
      dataPath: dataDir,
      clientId: 'woowhats-render-' + Date.now()
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
        // Render-specific optimizations
        '--memory-pressure-off',
        '--max_old_space_size=4096'
      ],
      ignoreHTTPSErrors: true,
      timeout: 60000,
      protocolTimeout: 60000
    },
    webVersionCache: {
      type: 'local'
    },
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    restartOnAuthFail: true,
    qrMaxRetries: 3,
    qrRefreshIntervalMs: 20000
  });

  // Register event handlers
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
        server: 'render'
      };
      console.log(`Connected as: ${sessionData.name} (${sessionData.phone})`);
      
      startKeepAlive();
      processPendingOperations();
    } catch (error) {
      console.error('Error getting client info:', error);
      sessionData = {
        connected: true,
        phone: 'Unknown',
        name: 'Unknown',
        timestamp: new Date().toISOString(),
        server: 'render'
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
    stopKeepAlive();
    handleReconnect('disconnected: ' + reason);
  });

  client.on('change_state', state => {
    console.log('WhatsApp state change:', state);
    lastActivity = Date.now();
  });

  client.on('loading_screen', (percent, message) => {
    console.log(`WhatsApp loading: ${percent}% - ${message}`);
    lastActivity = Date.now();
  });

  // Initialize the client
  console.log('Initializing WhatsApp client...');
  connectionStatus = 'connecting';
  client.initialize()
    .catch(err => {
      console.error('Error initializing WhatsApp client:', err);
      connectionStatus = 'disconnected';
      handleReconnect('init_error: ' + err.message);
    });
}

// Function to handle reconnection
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

// Function to start keep-alive mechanism
function startKeepAlive() {
  stopKeepAlive();
  
  console.log('Starting keep-alive mechanism');
  keepAliveInterval = setInterval(() => {
    if (connectionStatus === 'connected' && client) {
      if (Date.now() - lastActivity > 5 * 60 * 1000) {
        console.log('Sending keep-alive ping...');
        client.getState()
          .then(state => {
            console.log('Keep-alive response - current state:', state);
            lastActivity = Date.now();
          })
          .catch(err => {
            console.error('Keep-alive error:', err);
            if (err.message.includes('Session closed') || 
                err.message.includes('Protocol error')) {
              console.log('Keep-alive detected closed session, reconnecting...');
              handleReconnect('keep_alive_session_closed');
            }
          });
      }
    } else if (keepAliveInterval) {
      stopKeepAlive();
    }
  }, 60 * 1000);
}

// Function to stop keep-alive
function stopKeepAlive() {
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval);
    keepAliveInterval = null;
    console.log('Stopped keep-alive mechanism');
  }
}

// Add operation to pending queue
function addPendingOperation(operation) {
  pendingOperations.push(operation);
  console.log(`Added pending operation. Queue size: ${pendingOperations.length}`);
}

// Process pending operations
function processPendingOperations() {
  if (pendingOperations.length === 0) {
    return;
  }
  
  console.log(`Processing ${pendingOperations.length} pending operations...`);
  
  const operations = [...pendingOperations];
  pendingOperations = [];
  
  operations.forEach(operation => {
    try {
      operation();
    } catch (error) {
      console.error('Error processing pending operation:', error);
    }
  });
}

// Start the WhatsApp client
initializeWhatsAppClient();

// API ENDPOINTS

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ 
    status: 'ok',
    service: 'WooWhats WhatsApp Server',
    environment: NODE_ENV,
    uptime: process.uptime(),
    whatsappStatus: connectionStatus,
    port: PORT,
    lastActivity: new Date(lastActivity).toISOString(),
    memoryUsage: process.memoryUsage(),
    version: '1.0.0'
  });
});

// Health check for Render
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'healthy',
    whatsapp: connectionStatus,
    uptime: process.uptime()
  });
});

// Get QR code endpoint
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

// Get session data endpoint
app.get('/session', (req, res) => {
  res.json({ session: sessionData });
});

// Get status endpoint
app.get('/status', (req, res) => {
  if (connectionStatus === 'connected' && client) {
    try {
      client.getState()
        .then(state => {
          console.log('State check returned:', state);
          lastActivity = Date.now();
        })
        .catch(err => {
          console.error('State check error:', err);
          if (err.message.includes('Session closed') || 
              err.message.includes('Protocol error')) {
            console.log('Status check detected closed session, marking as disconnected');
            connectionStatus = 'disconnected';
            handleReconnect('status_check_session_closed');
          }
        });
    } catch (error) {
      console.error('Error during state check:', error);
    }
  }
  
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

// Send WhatsApp message endpoint
app.post('/send', async (req, res) => {
  lastActivity = Date.now();
  
  try {
    if (connectionStatus !== 'connected' || !client) {
      if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        console.log('Send requested but not connected. Queuing message and reconnecting...');
        
        const { to, message } = req.body;
        addPendingOperation(() => {
          sendWhatsAppMessage(to, message)
            .then(result => {
              console.log(`Queued message sent successfully to ${to}`);
            })
            .catch(err => {
              console.error(`Error sending queued message to ${to}:`, err);
            });
        });
        
        handleReconnect('send_requested_not_connected');
        
        return res.status(503).json({ 
          error: 'WhatsApp is reconnecting', 
          status: connectionStatus,
          recoverable: true,
          retry: true
        });
      }
      
      return res.status(400).json({ 
        error: 'WhatsApp is not connected', 
        status: connectionStatus 
      });
    }

    const { to, message } = req.body;
    if (!to || !message) {
      return res.status(400).json({ error: 'Missing required parameters: to, message' });
    }

    // Format the phone number correctly for WhatsApp Web
    let formattedNumber = to.replace(/\D/g, '');
    
    // Make sure we have a country code (default to 966 if none)
    if (formattedNumber.length <= 10) {
      formattedNumber = '966' + formattedNumber.replace(/^0+/, ''); // Assuming Saudi Arabia as default (966)
    }
    
    // Add @c.us suffix required by WhatsApp Web
    const chatId = `${formattedNumber}@c.us`;
    
    console.log(`Sending message to ${chatId}...`);
    
    // Send the message
    const result = await client.sendMessage(chatId, message);
    console.log(`Message sent successfully to ${chatId}`);
    res.json({ success: true, messageId: result.id._serialized });
  } catch (error) {
    console.error('Error sending message:', error);
    
    if (error.message.includes('Session closed') || 
        error.message.includes('Protocol error')) {
      
      console.log('Send detected closed session, attempting to recover...');
      
      const { to, message } = req.body;
      if (to && message) {
        addPendingOperation(() => {
          sendWhatsAppMessage(to, message)
            .then(result => {
              console.log(`Queued message sent successfully to ${to} after session recovery`);
            })
            .catch(err => {
              console.error(`Error sending queued message to ${to} after recovery:`, err);
            });
        });
      }
      
      handleReconnect('send_session_closed');
      
      return res.status(503).json({ 
        error: 'WhatsApp session error: ' + error.message, 
        recoverable: true, 
        retry: true 
      });
    }
    
    res.status(500).json({ error: error.message });
  }
});

// Disconnect endpoint
app.post('/disconnect', async (req, res) => {
  lastActivity = Date.now();
  
  try {
    if (connectionStatus === 'connected' && client) {
      console.log('Disconnecting WhatsApp client...');
      stopKeepAlive();
      
      try {
        await client.logout();
      } catch (logoutError) {
        console.error('Error during logout:', logoutError);
      }
      
      try {
        client.destroy();
      } catch (destroyError) {
        console.error('Error destroying client:', destroyError);
      }
      
      connectionStatus = 'disconnected';
      sessionData = null;
      qrCode = null;
      client = null;
      
      if (req.body.clearData) {
        console.log('Clearing auth data...');
        try {
          await fs.remove(dataDir);
          await fs.ensureDir(dataDir);
        } catch (error) {
          console.error('Error clearing auth data:', error);
        }
      }
      
      res.json({ success: true, message: 'Disconnected successfully' });
    } else {
      res.status(400).json({ error: 'Not connected' });
    }
  } catch (error) {
    console.error('Error disconnecting:', error);
    
    stopKeepAlive();
    connectionStatus = 'disconnected';
    sessionData = null;
    qrCode = null;
    client = null;
    
    res.json({ success: true, message: 'Attempted to disconnect, but there was an error: ' + error.message });
  }
});

// Force session refresh endpoint
app.post('/refresh-session', async (req, res) => {
  lastActivity = Date.now();
  
  console.log('Session refresh requested');
  
  if (connectionStatus === 'connected' && client) {
    try {
      const state = await client.getState();
      console.log('Current state:', state);
      res.json({ success: true, state });
    } catch (error) {
      console.error('Error getting state during refresh:', error);
      
      connectionStatus = 'disconnected';
      handleReconnect('refresh_session_error');
      
      res.status(503).json({ 
        error: 'Session error during refresh: ' + error.message, 
        reconnecting: true 
      });
    }
  } else {
    console.log('Not connected, initiating reconnection');
    handleReconnect('refresh_requested_not_connected');
    res.json({ success: true, reconnecting: true });
  }
});

// Function to send a message using the WhatsApp Web client
async function sendWhatsAppMessage(to, message) {
  if (connectionStatus !== 'connected' || !client) {
    throw new Error('WhatsApp is not connected');
  }

  try {
    let formattedNumber = to.replace(/\D/g, '');
    if (formattedNumber.length <= 10) {
      formattedNumber = '966' + formattedNumber.replace(/^0+/, '');
    }
    
    const chatId = `${formattedNumber}@c.us`;
    return await client.sendMessage(chatId, message);
  } catch (error) {
    console.error('Error sending message:', error);
    throw error;
  }
}

// Handle uncaught exceptions to prevent server crash
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Handle termination signals properly for Render
process.on('SIGINT', () => {
  console.log('Received SIGINT, shutting down...');
  shutdown();
});

process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down...');
  shutdown();
});

// Proper shutdown function
async function shutdown() {
  console.log('Shutting down server...');
  stopKeepAlive();
  
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
  
  process.exit(0);
}

// Start the server
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`WooWhats WhatsApp server running on port ${PORT}`);
  console.log(`Environment: ${NODE_ENV}`);
});

// Handle server errors
server.on('error', (error) => {
  console.error('Server error:', error);
});

// Export for testing
module.exports = { app, sendWhatsAppMessage };
