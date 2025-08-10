const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs-extra');

// Database initialization
const dbDir = path.join(__dirname, 'data');
fs.ensureDirSync(dbDir);
const dbPath = path.join(dbDir, 'woowhats.db');

class Database {
  constructor() {
    this.db = new sqlite3.Database(dbPath);
    this.init();
  }

  // Initialize database tables
  init() {
    const queries = [
      `CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT DEFAULT 'client',
        subscription_id TEXT,
        subscription_status TEXT DEFAULT 'inactive',
        subscription_plan TEXT,
        subscription_start_date INTEGER,
        subscription_end_date INTEGER,
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        updated_at INTEGER DEFAULT (strftime('%s', 'now')),
        last_login INTEGER,
        is_active INTEGER DEFAULT 1
      )`,
      `CREATE TABLE IF NOT EXISTS subscriptions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        plan_name TEXT NOT NULL,
        plan_price REAL NOT NULL,
        stripe_subscription_id TEXT,
        stripe_customer_id TEXT,
        status TEXT DEFAULT 'active',
        current_period_start INTEGER,
        current_period_end INTEGER,
        trial_end INTEGER,
        messages_limit INTEGER DEFAULT 1000,
        messages_used INTEGER DEFAULT 0,
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        updated_at INTEGER DEFAULT (strftime('%s', 'now')),
        FOREIGN KEY (user_id) REFERENCES users (id)
      )`,
      `CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        phone_number TEXT NOT NULL,
        message TEXT NOT NULL,
        status TEXT DEFAULT 'sent',
        sent_at INTEGER DEFAULT (strftime('%s', 'now')),
        FOREIGN KEY (user_id) REFERENCES users (id)
      )`,
      `CREATE TABLE IF NOT EXISTS payment_history (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        subscription_id TEXT,
        stripe_payment_id TEXT,
        amount REAL NOT NULL,
        currency TEXT DEFAULT 'USD',
        status TEXT NOT NULL,
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        FOREIGN KEY (user_id) REFERENCES users (id)
      )`
    ];

    let completedQueries = 0;
    const totalQueries = queries.length;

    queries.forEach((query, index) => {
      this.db.run(query, (err) => {
        if (err) {
          console.error(`Database init error for query ${index}:`, err);
        } else {
          console.log(`Database table ${index + 1}/${totalQueries} created successfully`);
        }
        
        completedQueries++;
        if (completedQueries === totalQueries) {
          // All tables created, now create default users
          setTimeout(() => this.createDefaultAdmin(), 100);
        }
      });
    });
  }

  // Create default admin and client users
  async createDefaultAdmin() {
    const adminExists = await this.getUser('admin');
    if (!adminExists) {
      await this.createUser({
        username: 'admin',
        email: 'admin@woowhats.com',
        password: 'demo123',
        role: 'admin'
      });
      console.log('Default admin user created: admin/demo123');
    }

    const clientExists = await this.getUser('client');
    if (!clientExists) {
      await this.createUser({
        username: 'client',
        email: 'client@woowhats.com',
        password: 'demo123',
        role: 'client'
      });
      console.log('Default client user created: client/demo123');
    }
  }

  // User management methods
  async createUser(userData) {
    const { username, email, password, role = 'client' } = userData;
    const hashedPassword = await bcrypt.hash(password, 10);
    const userId = uuidv4();

    return new Promise((resolve, reject) => {
      const query = `INSERT INTO users (id, username, email, password, role) VALUES (?, ?, ?, ?, ?)`;
      this.db.run(query, [userId, username, email, hashedPassword, role], function(err) {
        if (err) reject(err);
        else resolve({ id: userId, username, email, role });
      });
    });
  }

  async getUser(identifier) {
    return new Promise((resolve, reject) => {
      const query = `SELECT * FROM users WHERE username = ? OR email = ? OR id = ?`;
      this.db.get(query, [identifier, identifier, identifier], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  async validateUser(username, password) {
    const user = await this.getUser(username);
    if (user && await bcrypt.compare(password, user.password)) {
      // Update last login
      this.db.run(`UPDATE users SET last_login = strftime('%s', 'now') WHERE id = ?`, [user.id]);
      return user;
    }
    return null;
  }

  async getAllUsers() {
    return new Promise((resolve, reject) => {
      const query = `SELECT id, username, email, role, subscription_status, subscription_plan, created_at, last_login, is_active FROM users ORDER BY created_at DESC`;
      this.db.all(query, [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  async updateUser(userId, updates) {
    const allowedFields = ['email', 'role', 'subscription_status', 'subscription_plan', 'is_active'];
    const fields = Object.keys(updates).filter(key => allowedFields.includes(key));
    
    if (fields.length === 0) return false;

    const setClause = fields.map(field => `${field} = ?`).join(', ');
    const values = fields.map(field => updates[field]);
    values.push(userId);

    return new Promise((resolve, reject) => {
      const query = `UPDATE users SET ${setClause}, updated_at = strftime('%s', 'now') WHERE id = ?`;
      this.db.run(query, values, function(err) {
        if (err) reject(err);
        else resolve(this.changes > 0);
      });
    });
  }

  async deleteUser(userId) {
    return new Promise((resolve, reject) => {
      this.db.run(`DELETE FROM users WHERE id = ? AND role != 'admin'`, [userId], function(err) {
        if (err) reject(err);
        else resolve(this.changes > 0);
      });
    });
  }

  // Subscription management methods
  async createSubscription(subscriptionData) {
    const {
      user_id,
      plan_name,
      plan_price,
      stripe_subscription_id,
      stripe_customer_id,
      messages_limit = 1000
    } = subscriptionData;

    const subscriptionId = uuidv4();
    const now = Math.floor(Date.now() / 1000);
    const endDate = now + (30 * 24 * 60 * 60); // 30 days from now

    return new Promise((resolve, reject) => {
      const query = `INSERT INTO subscriptions 
        (id, user_id, plan_name, plan_price, stripe_subscription_id, stripe_customer_id, messages_limit, current_period_start, current_period_end) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
      
      this.db.run(query, [subscriptionId, user_id, plan_name, plan_price, stripe_subscription_id, stripe_customer_id, messages_limit, now, endDate], function(err) {
        if (err) reject(err);
        else {
          // Update user subscription status
          resolve(subscriptionId);
        }
      });
    });
  }

  async getUserSubscription(userId) {
    return new Promise((resolve, reject) => {
      const query = `SELECT * FROM subscriptions WHERE user_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1`;
      this.db.get(query, [userId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  async updateSubscription(subscriptionId, updates) {
    const allowedFields = ['status', 'current_period_end', 'messages_limit', 'messages_used'];
    const fields = Object.keys(updates).filter(key => allowedFields.includes(key));
    
    if (fields.length === 0) return false;

    const setClause = fields.map(field => `${field} = ?`).join(', ');
    const values = fields.map(field => updates[field]);
    values.push(subscriptionId);

    return new Promise((resolve, reject) => {
      const query = `UPDATE subscriptions SET ${setClause}, updated_at = strftime('%s', 'now') WHERE id = ?`;
      this.db.run(query, values, function(err) {
        if (err) reject(err);
        else resolve(this.changes > 0);
      });
    });
  }

  // Message tracking methods
  async logMessage(userId, phoneNumber, message) {
    const messageId = uuidv4();
    return new Promise((resolve, reject) => {
      const query = `INSERT INTO messages (id, user_id, phone_number, message) VALUES (?, ?, ?, ?)`;
      this.db.run(query, [messageId, userId, phoneNumber, message], function(err) {
        if (err) reject(err);
        else {
          // Increment message usage for subscription
          resolve(messageId);
        }
      });
    });
  }

  async getUserMessages(userId, limit = 50) {
    return new Promise((resolve, reject) => {
      const query = `SELECT * FROM messages WHERE user_id = ? ORDER BY sent_at DESC LIMIT ?`;
      this.db.all(query, [userId, limit], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  async incrementMessageUsage(userId) {
    return new Promise((resolve, reject) => {
      const query = `UPDATE subscriptions SET messages_used = messages_used + 1 WHERE user_id = ? AND status = 'active'`;
      this.db.run(query, [userId], function(err) {
        if (err) reject(err);
        else resolve(this.changes > 0);
      });
    });
  }

  async canSendMessage(userId) {
    const subscription = await this.getUserSubscription(userId);
    if (!subscription) return false;
    
    const now = Math.floor(Date.now() / 1000);
    if (now > subscription.current_period_end) return false;
    
    return subscription.messages_used < subscription.messages_limit;
  }

  // Admin statistics
  async getAdminStats() {
    return new Promise((resolve, reject) => {
      const queries = [
        'SELECT COUNT(*) as total_users FROM users WHERE role = "client"',
        'SELECT COUNT(*) as active_subscriptions FROM subscriptions WHERE status = "active"',
        'SELECT COUNT(*) as total_messages FROM messages WHERE sent_at > strftime("%s", "now", "-30 days")',
        'SELECT SUM(amount) as monthly_revenue FROM payment_history WHERE created_at > strftime("%s", "now", "-30 days") AND status = "completed"'
      ];

      let stats = {};
      let completed = 0;

      queries.forEach((query, index) => {
        this.db.get(query, [], (err, row) => {
          if (err) {
            reject(err);
            return;
          }
          
          const keys = ['total_users', 'active_subscriptions', 'total_messages', 'monthly_revenue'];
          stats[keys[index]] = Object.values(row)[0] || 0;
          
          completed++;
          if (completed === queries.length) {
            resolve(stats);
          }
        });
      });
    });
  }

  // Close database connection
  close() {
    this.db.close();
  }
}

module.exports = new Database();