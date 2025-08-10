const database = require('./database');

// Authentication middleware
function requireAuth(req, res, next) {
  if (req.session && req.session.user) {
    return next();
  } else {
    // Check if it's an API request
    const acceptHeader = req.get('Accept') || '';
    if (acceptHeader.includes('application/json')) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    // Redirect to login for browser requests
    return res.redirect('/auth/login');
  }
}

// Admin role middleware
function requireAdmin(req, res, next) {
  if (req.session && req.session.user && req.session.user.role === 'admin') {
    return next();
  } else {
    const acceptHeader = req.get('Accept') || '';
    if (acceptHeader.includes('application/json')) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    return res.status(403).send(`
      <html>
        <head>
          <title>Access Denied</title>
          <link rel="stylesheet" href="/css/style.css">
        </head>
        <body>
          <div class="login-container">
            <div class="login-box">
              <h1>🚫 Access Denied</h1>
              <p style="color: #dc3545; margin-bottom: 20px;">Admin privileges required.</p>
              <a href="/dashboard" class="btn" style="display: inline-block; text-decoration: none; margin-top: 15px;">Back to Dashboard</a>
            </div>
          </div>
        </body>
      </html>
    `);
  }
}

// Subscription check middleware
async function requireActiveSubscription(req, res, next) {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  // Skip for admin users
  if (req.session.user.role === 'admin') {
    return next();
  }

  try {
    const subscription = await database.getUserSubscription(req.session.user.id);
    
    if (!subscription) {
      return res.status(403).json({ 
        error: 'Active subscription required',
        needsSubscription: true 
      });
    }

    const now = Math.floor(Date.now() / 1000);
    if (now > subscription.current_period_end) {
      return res.status(403).json({ 
        error: 'Subscription expired',
        needsSubscription: true 
      });
    }

    // Add subscription info to request
    req.subscription = subscription;
    next();
  } catch (error) {
    console.error('Error checking subscription:', error);
    res.status(500).json({ error: 'Server error checking subscription' });
  }
}

// Message limit check middleware
async function checkMessageLimit(req, res, next) {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  // Skip for admin users
  if (req.session.user.role === 'admin') {
    return next();
  }

  try {
    const canSend = await database.canSendMessage(req.session.user.id);
    
    if (!canSend) {
      const subscription = await database.getUserSubscription(req.session.user.id);
      return res.status(403).json({ 
        error: 'Message limit exceeded or subscription expired',
        messageLimit: subscription ? subscription.messages_limit : 0,
        messagesUsed: subscription ? subscription.messages_used : 0,
        needsUpgrade: true
      });
    }

    next();
  } catch (error) {
    console.error('Error checking message limit:', error);
    res.status(500).json({ error: 'Server error checking message limit' });
  }
}

// Rate limiting middleware (simple in-memory implementation)
const rateLimitMap = new Map();

function rateLimit(windowMs = 15 * 60 * 1000, maxRequests = 100) {
  return (req, res, next) => {
    const key = req.ip + (req.session?.user?.id || 'anonymous');
    const now = Date.now();
    
    if (!rateLimitMap.has(key)) {
      rateLimitMap.set(key, { count: 1, resetTime: now + windowMs });
      return next();
    }
    
    const limit = rateLimitMap.get(key);
    
    if (now > limit.resetTime) {
      limit.count = 1;
      limit.resetTime = now + windowMs;
      return next();
    }
    
    if (limit.count >= maxRequests) {
      return res.status(429).json({
        error: 'Too many requests',
        retryAfter: Math.ceil((limit.resetTime - now) / 1000)
      });
    }
    
    limit.count++;
    next();
  };
}

// Clean up rate limit map periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, limit] of rateLimitMap.entries()) {
    if (now > limit.resetTime) {
      rateLimitMap.delete(key);
    }
  }
}, 5 * 60 * 1000); // Clean up every 5 minutes

// User session enhancement middleware
async function enhanceUserSession(req, res, next) {
  if (req.session && req.session.user) {
    try {
      // Refresh user data from database
      const user = await database.getUser(req.session.user.id);
      if (user) {
        req.session.user = {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
          subscription_status: user.subscription_status,
          subscription_plan: user.subscription_plan
        };
      }
    } catch (error) {
      console.error('Error enhancing user session:', error);
    }
  }
  next();
}

// Subscription status check for admin
function checkUserAccess(req, res, next) {
  if (!req.session || !req.session.user) {
    return res.redirect('/auth/login');
  }

  // Check if user is deactivated
  if (req.session.user.is_active === 0) {
    req.session.destroy();
    return res.redirect('/auth/login?error=account_deactivated');
  }

  next();
}

module.exports = {
  requireAuth,
  requireAdmin,
  requireActiveSubscription,
  checkMessageLimit,
  rateLimit,
  enhanceUserSession,
  checkUserAccess
};