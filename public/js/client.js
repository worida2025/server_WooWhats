// Client Panel JavaScript
let stripe;
let elements;
let currentUser = null;
let userSubscription = null;

document.addEventListener('DOMContentLoaded', function() {
    // Initialize client panel
    initializeClient();
    
    // Set up event listeners
    setupEventListeners();
    
    // Load initial data
    loadUserProfile();
    loadMessageHistory();
    
    // Initialize Stripe
    initializeStripe();
});

async function initializeClient() {
    try {
        const response = await fetch('/api/user/profile');
        const data = await response.json();
        
        if (data.user) {
            currentUser = data.user;
            document.getElementById('clientUsername').textContent = data.user.username;
            
            // Redirect admin users to admin panel
            if (data.user.role === 'admin') {
                window.location.href = '/admin';
                return;
            }
            
            updateSubscriptionBanner();
        } else {
            window.location.href = '/auth/login';
        }
    } catch (error) {
        console.error('Error checking user status:', error);
        window.location.href = '/auth/login';
    }
}

async function initializeStripe() {
    try {
        const response = await fetch('/api/stripe/config');
        const data = await response.json();
        
        if (data.publishable_key) {
            stripe = Stripe(data.publishable_key);
        }
    } catch (error) {
        console.error('Error initializing Stripe:', error);
    }
}

function setupEventListeners() {
    // Message form
    document.getElementById('messageForm').addEventListener('submit', handleSendMessage);
    
    // Refresh messages
    document.getElementById('refreshMessagesBtn').addEventListener('click', loadMessageHistory);
    
    // Subscription management
    document.getElementById('manageSubscriptionBtn').addEventListener('click', manageSubscription);
    document.getElementById('downloadInvoicesBtn').addEventListener('click', downloadInvoices);
    
    // Payment modal
    document.getElementById('cancelPayment').addEventListener('click', hidePaymentModal);
}

async function loadUserProfile() {
    try {
        const response = await fetch('/api/user/profile');
        const data = await response.json();
        
        if (data.user) {
            currentUser = data.user;
            userSubscription = data.subscription;
            
            // Update account information
            document.getElementById('userEmail').textContent = data.user.email;
            document.getElementById('userPlan').textContent = data.user.subscription_plan || 'Free';
            document.getElementById('userStatus').textContent = data.user.subscription_status || 'inactive';
            document.getElementById('memberSince').textContent = formatDate(data.user.created_at);
            
            updateSubscriptionBanner();
            checkSubscriptionStatus();
        }
    } catch (error) {
        console.error('Error loading user profile:', error);
    }
}

function updateSubscriptionBanner() {
    const banner = document.getElementById('subscriptionBanner');
    const title = document.getElementById('bannerTitle');
    const message = document.getElementById('bannerMessage');
    const usageBar = document.getElementById('usageBar');
    const usageText = document.getElementById('usageText');
    const messagesUsed = document.getElementById('messagesUsed');
    const messagesLimit = document.getElementById('messagesLimit');
    const usageFill = document.getElementById('usageFill');
    
    if (!currentUser || !userSubscription) {
        // No active subscription
        banner.className = 'subscription-banner subscription-expired';
        title.textContent = 'No Active Subscription';
        message.textContent = 'Subscribe to start sending WhatsApp messages.';
        usageBar.style.display = 'none';
        usageText.textContent = 'Messages: 0 / 0';
        document.getElementById('upgradeSection').style.display = 'block';
        return;
    }
    
    const now = Math.floor(Date.now() / 1000);
    const isExpired = now > userSubscription.current_period_end;
    const usagePercent = userSubscription.messages_limit > 0 
        ? (userSubscription.messages_used / userSubscription.messages_limit) * 100 
        : 0;
    
    if (isExpired) {
        banner.className = 'subscription-banner subscription-expired';
        title.textContent = 'Subscription Expired';
        message.textContent = 'Your subscription has expired. Renew to continue sending messages.';
        document.getElementById('upgradeSection').style.display = 'block';
    } else if (userSubscription.messages_used >= userSubscription.messages_limit) {
        banner.className = 'subscription-banner subscription-expired';
        title.textContent = 'Message Limit Reached';
        message.textContent = 'You\'ve reached your monthly message limit. Upgrade for more messages.';
        document.getElementById('upgradeSection').style.display = 'block';
    } else {
        banner.className = 'subscription-banner';
        title.textContent = userSubscription.plan_name || 'Active Subscription';
        message.textContent = `Your subscription is active until ${formatDate(userSubscription.current_period_end)}.`;
        document.getElementById('upgradeSection').style.display = 'none';
    }
    
    // Update usage bar
    usageBar.style.display = 'block';
    usageFill.style.width = `${Math.min(usagePercent, 100)}%`;
    messagesUsed.textContent = userSubscription.messages_used || 0;
    messagesLimit.textContent = userSubscription.messages_limit || 0;
    usageText.style.display = 'block';
    
    // Change bar color based on usage
    if (usagePercent >= 90) {
        usageFill.style.background = '#dc3545';
    } else if (usagePercent >= 75) {
        usageFill.style.background = '#ffc107';
    } else {
        usageFill.style.background = 'white';
    }
}

function checkSubscriptionStatus() {
    if (!userSubscription) {
        // Show upgrade section for users without subscription
        document.getElementById('upgradeSection').style.display = 'block';
        return;
    }
    
    const now = Math.floor(Date.now() / 1000);
    const isExpired = now > userSubscription.current_period_end;
    const limitReached = userSubscription.messages_used >= userSubscription.messages_limit;
    
    if (isExpired || limitReached) {
        document.getElementById('upgradeSection').style.display = 'block';
    }
}

async function handleSendMessage(e) {
    e.preventDefault();
    
    const phoneInput = document.getElementById('phoneInput');
    const messageText = document.getElementById('messageText');
    const sendBtn = document.getElementById('sendBtn');
    const resultDiv = document.getElementById('messageResult');
    
    // Check if user can send messages
    if (!canSendMessage()) {
        resultDiv.innerHTML = `
            <div style="color: #dc3545; padding: 1rem; background: #f8d7da; border-radius: 5px;">
                ❌ You cannot send messages. Please upgrade your subscription or check your message limit.
            </div>
        `;
        resultDiv.style.display = 'block';
        return;
    }
    
    const phone = phoneInput.value.trim();
    const message = messageText.value.trim();
    
    if (!phone || !message) {
        resultDiv.innerHTML = `
            <div style="color: #dc3545; padding: 1rem; background: #f8d7da; border-radius: 5px;">
                ❌ Please fill in both phone number and message.
            </div>
        `;
        resultDiv.style.display = 'block';
        return;
    }
    
    // Disable form
    sendBtn.disabled = true;
    sendBtn.textContent = '📤 Sending...';
    resultDiv.style.display = 'none';
    
    try {
        const response = await fetch('/api/send', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                to: phone,
                message: message
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            resultDiv.innerHTML = `
                <div style="color: #155724; padding: 1rem; background: #d4edda; border-radius: 5px;">
                    ✅ Message sent successfully to ${phone}!
                </div>
            `;
            messageText.value = '';
            
            // Refresh user data and message history
            loadUserProfile();
            loadMessageHistory();
        } else {
            resultDiv.innerHTML = `
                <div style="color: #dc3545; padding: 1rem; background: #f8d7da; border-radius: 5px;">
                    ❌ Error: ${data.error}
                </div>
            `;
            
            if (data.needsUpgrade || data.needsSubscription) {
                document.getElementById('upgradeSection').style.display = 'block';
            }
        }
    } catch (error) {
        console.error('Error sending message:', error);
        resultDiv.innerHTML = `
            <div style="color: #dc3545; padding: 1rem; background: #f8d7da; border-radius: 5px;">
                ❌ Network error. Please try again.
            </div>
        `;
    }
    
    // Re-enable form
    sendBtn.disabled = false;
    sendBtn.textContent = '📤 Send Message';
    resultDiv.style.display = 'block';
}

function canSendMessage() {
    if (!userSubscription) return false;
    
    const now = Math.floor(Date.now() / 1000);
    const isExpired = now > userSubscription.current_period_end;
    const limitReached = userSubscription.messages_used >= userSubscription.messages_limit;
    
    return !isExpired && !limitReached;
}

async function loadMessageHistory() {
    try {
        const response = await fetch('/api/user/messages');
        const data = await response.json();
        
        if (data.success) {
            displayMessageHistory(data.messages);
        }
    } catch (error) {
        console.error('Error loading message history:', error);
        document.getElementById('messageHistory').innerHTML = `
            <div style="text-align: center; padding: 2rem; color: #dc3545;">
                Error loading message history
            </div>
        `;
    }
}

function displayMessageHistory(messages) {
    const container = document.getElementById('messageHistory');
    
    if (messages.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 2rem; color: #666;">
                No messages sent yet. Send your first message above!
            </div>
        `;
        return;
    }
    
    container.innerHTML = messages.map(message => `
        <div class="message-item">
            <div class="message-content">
                <div class="message-phone">${escapeHtml(message.phone_number)}</div>
                <div class="message-text">${escapeHtml(message.message)}</div>
                <div class="message-time">${formatDate(message.sent_at)}</div>
            </div>
            <div class="status-badge status-active">${message.status}</div>
        </div>
    `).join('');
}

async function selectPlan(planId) {
    if (!stripe) {
        alert('Payment system is not available. Please contact support.');
        return;
    }
    
    try {
        showPaymentModal();
        
        const response = await fetch('/api/stripe/create-subscription', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ plan_id: planId })
        });
        
        const data = await response.json();
        
        if (data.success) {
            // Handle payment with Stripe
            const { error } = await stripe.confirmPayment({
                elements,
                clientSecret: data.client_secret,
                confirmParams: {
                    return_url: window.location.href
                }
            });
            
            if (error) {
                alert('Payment failed: ' + error.message);
                hidePaymentModal();
            }
        } else {
            alert('Error creating subscription: ' + data.error);
            hidePaymentModal();
        }
    } catch (error) {
        console.error('Error selecting plan:', error);
        alert('Error processing subscription');
        hidePaymentModal();
    }
}

async function manageSubscription() {
    try {
        const response = await fetch('/api/stripe/customer-portal', {
            method: 'POST'
        });
        
        const data = await response.json();
        
        if (data.success) {
            window.open(data.url, '_blank');
        } else {
            alert('Error: ' + data.error);
        }
    } catch (error) {
        console.error('Error managing subscription:', error);
        alert('Error opening customer portal');
    }
}

async function downloadInvoices() {
    try {
        const response = await fetch('/api/user/invoices');
        const data = await response.json();
        
        if (data.success) {
            if (data.invoices.length === 0) {
                alert('No invoices found');
                return;
            }
            
            // Open first invoice (in a real app, show list)
            window.open(data.invoices[0].invoice_pdf, '_blank');
        } else {
            alert('Error: ' + data.error);
        }
    } catch (error) {
        console.error('Error downloading invoices:', error);
        alert('Error downloading invoices');
    }
}

function showPaymentModal() {
    document.getElementById('paymentModal').style.display = 'block';
}

function hidePaymentModal() {
    document.getElementById('paymentModal').style.display = 'none';
}

// Utility functions
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatDate(timestamp) {
    if (!timestamp) return 'Never';
    const date = new Date(timestamp * 1000);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
}

// Auto-refresh data every 30 seconds
setInterval(() => {
    loadUserProfile();
}, 30000);