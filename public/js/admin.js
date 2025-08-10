// Admin Panel JavaScript
let currentSection = 'dashboard';
let currentEditUserId = null;

document.addEventListener('DOMContentLoaded', function() {
    // Initialize admin panel
    initializeAdmin();
    
    // Set up navigation
    setupNavigation();
    
    // Set up event listeners
    setupEventListeners();
    
    // Load initial data
    loadDashboardStats();
    loadServerInfo();
});

function initializeAdmin() {
    // Check if user is admin
    fetch('/api/user/profile')
        .then(response => response.json())
        .then(data => {
            if (data.user && data.user.role === 'admin') {
                document.getElementById('adminUsername').textContent = data.user.username;
            } else {
                window.location.href = '/dashboard';
            }
        })
        .catch(error => {
            console.error('Error checking admin status:', error);
            window.location.href = '/auth/login';
        });
}

function setupNavigation() {
    const navLinks = document.querySelectorAll('.nav-link');
    navLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const section = this.dataset.section;
            showSection(section);
            
            // Update active nav
            navLinks.forEach(l => l.classList.remove('active'));
            this.classList.add('active');
        });
    });
}

function setupEventListeners() {
    // Refresh buttons
    document.getElementById('refreshStats').addEventListener('click', loadDashboardStats);
    document.getElementById('refreshSubscriptions').addEventListener('click', loadSubscriptions);
    document.getElementById('refreshMessages').addEventListener('click', loadMessages);
    
    // Add user button
    document.getElementById('addUserBtn').addEventListener('click', showAddUserModal);
    
    // Modal controls
    document.getElementById('cancelModal').addEventListener('click', hideUserModal);
    document.getElementById('userForm').addEventListener('submit', handleUserForm);
    
    // Close modal on outside click
    document.getElementById('userModal').addEventListener('click', function(e) {
        if (e.target === this) {
            hideUserModal();
        }
    });
}

function showSection(section) {
    // Hide all sections
    const sections = document.querySelectorAll('.admin-section');
    sections.forEach(s => s.style.display = 'none');
    
    // Show selected section
    document.getElementById(`${section}-section`).style.display = 'block';
    currentSection = section;
    
    // Load section data
    switch(section) {
        case 'users':
            loadUsers();
            break;
        case 'subscriptions':
            loadSubscriptions();
            break;
        case 'messages':
            loadMessages();
            break;
        case 'settings':
            loadSettings();
            break;
    }
}

async function loadDashboardStats() {
    try {
        const response = await fetch('/api/admin/stats');
        const data = await response.json();
        
        if (data.success) {
            document.getElementById('totalUsers').textContent = data.stats.total_users || 0;
            document.getElementById('activeSubscriptions').textContent = data.stats.active_subscriptions || 0;
            document.getElementById('totalMessages').textContent = data.stats.total_messages || 0;
            document.getElementById('monthlyRevenue').textContent = '$' + (data.stats.monthly_revenue || 0).toFixed(2);
        }
    } catch (error) {
        console.error('Error loading dashboard stats:', error);
    }
}

async function loadUsers() {
    try {
        const response = await fetch('/api/admin/users');
        const data = await response.json();
        
        if (data.success) {
            displayUsers(data.users);
        }
    } catch (error) {
        console.error('Error loading users:', error);
        document.getElementById('usersTableBody').innerHTML = `
            <tr><td colspan="8" style="text-align: center; color: #dc3545;">Error loading users</td></tr>
        `;
    }
}

function displayUsers(users) {
    const tbody = document.getElementById('usersTableBody');
    
    if (users.length === 0) {
        tbody.innerHTML = `
            <tr><td colspan="8" style="text-align: center; color: #666;">No users found</td></tr>
        `;
        return;
    }
    
    tbody.innerHTML = users.map(user => `
        <tr>
            <td>${escapeHtml(user.username)}</td>
            <td>${escapeHtml(user.email)}</td>
            <td><span class="status-badge ${user.role === 'admin' ? 'status-active' : ''}">${user.role}</span></td>
            <td>${user.subscription_plan || 'None'}</td>
            <td><span class="status-badge ${getStatusClass(user.subscription_status)}">${user.subscription_status || 'inactive'}</span></td>
            <td>${formatDate(user.created_at)}</td>
            <td>${user.last_login ? formatDate(user.last_login) : 'Never'}</td>
            <td>
                <div class="action-buttons">
                    <button class="btn-small btn-edit" onclick="editUser('${user.id}')">Edit</button>
                    ${user.role !== 'admin' ? `<button class="btn-small btn-delete" onclick="deleteUser('${user.id}')">Delete</button>` : ''}
                    <button class="btn-small btn-view" onclick="viewUserDetails('${user.id}')">View</button>
                </div>
            </td>
        </tr>
    `).join('');
}

async function loadSubscriptions() {
    try {
        const response = await fetch('/api/admin/plans');
        const data = await response.json();
        
        if (data.success) {
            displayPlans(data.plans);
        }
    } catch (error) {
        console.error('Error loading subscriptions:', error);
    }
}

function displayPlans(plans) {
    const container = document.getElementById('plansContainer');
    
    container.innerHTML = plans.map(plan => `
        <div class="card" style="margin-bottom: 1rem;">
            <h4>${plan.name}</h4>
            <p><strong>Price:</strong> $${plan.price}/${plan.interval}</p>
            <p><strong>Message Limit:</strong> ${plan.messages_limit} messages</p>
            <p><strong>Features:</strong></p>
            <ul>
                ${plan.features.map(feature => `<li>${feature}</li>`).join('')}
            </ul>
        </div>
    `).join('');
}

async function loadMessages() {
    try {
        const response = await fetch('/api/admin/messages');
        const data = await response.json();
        
        if (data.success) {
            displayMessages(data.messages);
        }
    } catch (error) {
        console.error('Error loading messages:', error);
        document.getElementById('messagesTableBody').innerHTML = `
            <tr><td colspan="5" style="text-align: center; color: #dc3545;">Error loading messages</td></tr>
        `;
    }
}

function displayMessages(messages) {
    const tbody = document.getElementById('messagesTableBody');
    
    if (messages.length === 0) {
        tbody.innerHTML = `
            <tr><td colspan="5" style="text-align: center; color: #666;">No messages found</td></tr>
        `;
        return;
    }
    
    tbody.innerHTML = messages.map(message => `
        <tr>
            <td>${escapeHtml(message.username || 'Unknown')}</td>
            <td>${escapeHtml(message.phone_number)}</td>
            <td>${escapeHtml(message.message.substring(0, 50))}${message.message.length > 50 ? '...' : ''}</td>
            <td><span class="status-badge status-active">${message.status}</span></td>
            <td>${formatDate(message.sent_at)}</td>
        </tr>
    `).join('');
}

async function loadSettings() {
    try {
        const response = await fetch('/api/admin/settings');
        const data = await response.json();
        
        if (data.success) {
            document.getElementById('envMode').textContent = data.settings.environment || 'Unknown';
            document.getElementById('whatsappStatus').textContent = data.settings.whatsapp_status || 'Unknown';
            document.getElementById('stripeStatus').textContent = data.settings.stripe_enabled ? 'Enabled' : 'Disabled';
            document.getElementById('stripeStatusText').textContent = data.settings.stripe_enabled ? 'Stripe is configured' : 'Stripe is not configured';
        }
    } catch (error) {
        console.error('Error loading settings:', error);
    }
}

async function loadServerInfo() {
    try {
        const response = await fetch('/status');
        const data = await response.json();
        
        if (data) {
            document.getElementById('serverUptime').textContent = formatUptime(data.uptime || 0);
        }
    } catch (error) {
        console.error('Error loading server info:', error);
    }
}

// User management functions
function showAddUserModal() {
    currentEditUserId = null;
    document.getElementById('modalTitle').textContent = 'Add User';
    document.getElementById('userForm').reset();
    document.getElementById('modalPassword').required = true;
    document.getElementById('userModal').style.display = 'block';
}

async function editUser(userId) {
    try {
        const response = await fetch(`/api/admin/users/${userId}`);
        const data = await response.json();
        
        if (data.success) {
            currentEditUserId = userId;
            document.getElementById('modalTitle').textContent = 'Edit User';
            document.getElementById('modalUsername').value = data.user.username;
            document.getElementById('modalEmail').value = data.user.email;
            document.getElementById('modalPassword').value = '';
            document.getElementById('modalPassword').required = false;
            document.getElementById('modalRole').value = data.user.role;
            document.getElementById('userModal').style.display = 'block';
        }
    } catch (error) {
        console.error('Error loading user:', error);
        alert('Error loading user details');
    }
}

async function deleteUser(userId) {
    if (!confirm('Are you sure you want to delete this user? This action cannot be undone.')) {
        return;
    }
    
    try {
        const response = await fetch(`/api/admin/users/${userId}`, {
            method: 'DELETE'
        });
        const data = await response.json();
        
        if (data.success) {
            alert('User deleted successfully');
            loadUsers();
        } else {
            alert('Error deleting user: ' + data.error);
        }
    } catch (error) {
        console.error('Error deleting user:', error);
        alert('Error deleting user');
    }
}

async function viewUserDetails(userId) {
    try {
        const response = await fetch(`/api/admin/users/${userId}/details`);
        const data = await response.json();
        
        if (data.success) {
            const details = data.details;
            const info = [
                `Username: ${details.username}`,
                `Email: ${details.email}`,
                `Role: ${details.role}`,
                `Subscription: ${details.subscription_plan || 'None'}`,
                `Status: ${details.subscription_status || 'inactive'}`,
                `Messages Sent: ${details.total_messages || 0}`,
                `Created: ${formatDate(details.created_at)}`,
                `Last Login: ${details.last_login ? formatDate(details.last_login) : 'Never'}`
            ].join('\n');
            
            alert(info);
        }
    } catch (error) {
        console.error('Error loading user details:', error);
        alert('Error loading user details');
    }
}

function hideUserModal() {
    document.getElementById('userModal').style.display = 'none';
    currentEditUserId = null;
}

async function handleUserForm(e) {
    e.preventDefault();
    
    const formData = {
        username: document.getElementById('modalUsername').value,
        email: document.getElementById('modalEmail').value,
        role: document.getElementById('modalRole').value
    };
    
    const password = document.getElementById('modalPassword').value;
    if (password) {
        formData.password = password;
    }
    
    try {
        const url = currentEditUserId ? `/api/admin/users/${currentEditUserId}` : '/api/admin/users';
        const method = currentEditUserId ? 'PUT' : 'POST';
        
        const response = await fetch(url, {
            method: method,
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(formData)
        });
        
        const data = await response.json();
        
        if (data.success) {
            alert(currentEditUserId ? 'User updated successfully' : 'User created successfully');
            hideUserModal();
            loadUsers();
        } else {
            alert('Error: ' + data.error);
        }
    } catch (error) {
        console.error('Error saving user:', error);
        alert('Error saving user');
    }
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

function formatUptime(seconds) {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (days > 0) {
        return `${days}d ${hours}h ${minutes}m`;
    } else if (hours > 0) {
        return `${hours}h ${minutes}m`;
    } else {
        return `${minutes}m`;
    }
}

function getStatusClass(status) {
    switch(status) {
        case 'active': return 'status-active';
        case 'past_due': return 'status-past-due';
        case 'cancelled': return 'status-inactive';
        default: return 'status-inactive';
    }
}

// Auto-refresh data every 30 seconds
setInterval(() => {
    if (currentSection === 'dashboard') {
        loadDashboardStats();
    }
    loadServerInfo();
}, 30000);