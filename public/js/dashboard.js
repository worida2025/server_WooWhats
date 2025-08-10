// WooWhats Dashboard JavaScript

class WooWhatsDashboard {
    constructor() {
        this.refreshInterval = null;
        this.init();
    }

    init() {
        this.startAutoRefresh();
        this.bindEvents();
        this.updateStatus();
    }

    bindEvents() {
        // Send message form
        const messageForm = document.getElementById('messageForm');
        if (messageForm) {
            messageForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.sendMessage();
            });
        }

        // Action buttons
        document.addEventListener('click', (e) => {
            if (e.target.matches('[data-action]')) {
                const action = e.target.getAttribute('data-action');
                this.handleAction(action, e.target);
            }
        });

        // Manual refresh button
        const refreshBtn = document.getElementById('refreshBtn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                this.updateStatus();
            });
        }
    }

    async handleAction(action, button) {
        const originalText = button.textContent;
        button.disabled = true;
        button.innerHTML = '<span class="loading"></span> Processing...';

        try {
            let response;
            switch (action) {
                case 'disconnect':
                    response = await fetch('/disconnect', { method: 'POST' });
                    break;
                case 'refresh-session':
                    response = await fetch('/refresh-session', { method: 'POST' });
                    break;
                default:
                    console.warn('Unknown action:', action);
                    return;
            }

            const result = await response.json();
            if (result.success) {
                this.showAlert('Action completed successfully!', 'success');
                setTimeout(() => this.updateStatus(), 1000);
            } else {
                this.showAlert(result.error || 'Action failed', 'danger');
            }
        } catch (error) {
            console.error('Action error:', error);
            this.showAlert('Network error occurred', 'danger');
        } finally {
            button.disabled = false;
            button.textContent = originalText;
        }
    }

    async sendMessage() {
        const phoneInput = document.getElementById('phoneInput');
        const messageInput = document.getElementById('messageText');
        const sendBtn = document.getElementById('sendBtn');

        if (!phoneInput || !messageInput || !sendBtn) return;

        const phone = phoneInput.value.trim();
        const message = messageInput.value.trim();

        if (!phone || !message) {
            this.showAlert('Please enter both phone number and message', 'danger');
            return;
        }

        const originalText = sendBtn.textContent;
        sendBtn.disabled = true;
        sendBtn.innerHTML = '<span class="loading"></span> Sending...';

        try {
            const response = await fetch('/send', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    to: phone,
                    message: message
                })
            });

            const result = await response.json();

            if (result.success) {
                this.showAlert('Message sent successfully!', 'success');
                messageInput.value = '';
            } else {
                this.showAlert(result.error || 'Failed to send message', 'danger');
            }
        } catch (error) {
            console.error('Send message error:', error);
            this.showAlert('Network error occurred', 'danger');
        } finally {
            sendBtn.disabled = false;
            sendBtn.textContent = originalText;
        }
    }

    async updateStatus() {
        try {
            const [statusResponse, qrResponse] = await Promise.all([
                fetch('/status'),
                fetch('/qr')
            ]);

            const statusData = await statusResponse.json();
            const qrData = await qrResponse.json();

            this.updateStatusDisplay(statusData);
            this.updateQRCode(qrData);
            this.updateServerInfo(statusData);

        } catch (error) {
            console.error('Update status error:', error);
            this.showAlert('Failed to update status', 'danger');
        }
    }

    updateStatusDisplay(data) {
        const statusBadge = document.getElementById('statusBadge');
        const statusText = document.getElementById('statusText');

        if (statusBadge && statusText) {
            statusBadge.className = 'status-badge';
            
            switch (data.status) {
                case 'connected':
                    statusBadge.classList.add('status-connected');
                    statusText.textContent = 'Connected';
                    break;
                case 'connecting':
                    statusBadge.classList.add('status-connecting');
                    statusText.textContent = 'Connecting';
                    break;
                default:
                    statusBadge.classList.add('status-disconnected');
                    statusText.textContent = 'Disconnected';
            }
        }

        // Update phone number display
        const phoneDisplay = document.getElementById('phoneNumber');
        if (phoneDisplay) {
            phoneDisplay.textContent = data.phone || 'Not connected';
        }

        // Update connection info
        this.updateElement('connectionStatus', data.status || 'Unknown');
        this.updateElement('isReady', data.isReady ? 'Yes' : 'No');
        this.updateElement('hasSession', data.session ? 'Yes' : 'No');
        this.updateElement('reconnectAttempts', data.reconnectAttempts || '0');
    }

    updateQRCode(data) {
        const qrContainer = document.getElementById('qrCodeContainer');
        if (!qrContainer) return;

        if (data.qr) {
            qrContainer.innerHTML = `
                <img src="data:image/png;base64,${data.qr}" alt="WhatsApp QR Code" class="qr-code" />
                <p style="margin-top: 15px; color: #666; font-size: 14px;">
                    Scan this QR code with WhatsApp to connect
                </p>
            `;
        } else {
            const statusData = document.getElementById('statusBadge');
            const isConnected = statusData && statusData.classList.contains('status-connected');
            
            qrContainer.innerHTML = `
                <div class="qr-placeholder">
                    ${isConnected ? 
                        'WhatsApp is connected! 📱✅' : 
                        'QR code will appear here when connecting...'
                    }
                </div>
            `;
        }
    }

    updateServerInfo(data) {
        this.updateElement('serverUptime', this.formatUptime(data.uptime));
        this.updateElement('serverPort', data.port || 'Unknown');
        this.updateElement('serverEnvironment', data.environment || 'Unknown');
        this.updateElement('lastActivity', new Date(data.lastActivity).toLocaleString());
        
        if (data.memoryUsage) {
            this.updateElement('memoryUsage', this.formatMemory(data.memoryUsage.rss));
        }
    }

    updateElement(id, value) {
        const element = document.getElementById(id);
        if (element) {
            element.textContent = value;
        }
    }

    formatUptime(seconds) {
        if (!seconds) return 'Unknown';
        
        const days = Math.floor(seconds / 86400);
        const hours = Math.floor((seconds % 86400) / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);

        if (days > 0) {
            return `${days}d ${hours}h ${minutes}m`;
        } else if (hours > 0) {
            return `${hours}h ${minutes}m ${secs}s`;
        } else if (minutes > 0) {
            return `${minutes}m ${secs}s`;
        } else {
            return `${secs}s`;
        }
    }

    formatMemory(bytes) {
        if (!bytes) return 'Unknown';
        
        const mb = bytes / (1024 * 1024);
        return `${mb.toFixed(1)} MB`;
    }

    showAlert(message, type = 'info') {
        // Remove existing alerts
        const existingAlerts = document.querySelectorAll('.alert');
        existingAlerts.forEach(alert => alert.remove());

        // Create new alert
        const alert = document.createElement('div');
        alert.className = `alert alert-${type}`;
        alert.textContent = message;

        // Insert at top of container
        const container = document.querySelector('.container');
        if (container) {
            container.insertBefore(alert, container.firstChild);

            // Auto-remove after 5 seconds
            setTimeout(() => {
                if (alert.parentNode) {
                    alert.remove();
                }
            }, 5000);
        }
    }

    startAutoRefresh() {
        // Refresh every 10 seconds
        this.refreshInterval = setInterval(() => {
            this.updateStatus();
        }, 10000);

        // Update refresh indicator
        this.updateRefreshIndicator();
        setInterval(() => {
            this.updateRefreshIndicator();
        }, 1000);
    }

    updateRefreshIndicator() {
        const indicator = document.getElementById('refreshIndicator');
        if (indicator) {
            const now = new Date();
            indicator.textContent = `Last updated: ${now.toLocaleTimeString()}`;
        }
    }

    destroy() {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
        }
    }
}

// Initialize dashboard when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    if (document.body.classList.contains('dashboard-page')) {
        window.wooWhatsDashboard = new WooWhatsDashboard();
    }
});

// Handle page visibility changes to pause/resume updates
document.addEventListener('visibilitychange', () => {
    if (window.wooWhatsDashboard) {
        if (document.hidden) {
            // Page is hidden, stop auto-refresh
            if (window.wooWhatsDashboard.refreshInterval) {
                clearInterval(window.wooWhatsDashboard.refreshInterval);
                window.wooWhatsDashboard.refreshInterval = null;
            }
        } else {
            // Page is visible, resume auto-refresh
            window.wooWhatsDashboard.startAutoRefresh();
        }
    }
});