# WooWhats Server for Render

A Node.js WhatsApp Web server designed for deployment on Render.com, providing WhatsApp integration for WooCommerce stores.

## Features

- WhatsApp Web integration using whatsapp-web.js
- RESTful API for sending messages
- QR code authentication
- Session management
- Health monitoring
- Auto-reconnection handling
- Render.com optimized deployment

## Environment Variables

Set these environment variables in your Render dashboard:

- `PORT` - Server port (automatically set by Render)
- `NODE_ENV` - Environment (production/development)
- `WHATSAPP_SESSION_PATH` - Path for session storage (optional)
- `ALLOWED_ORIGINS` - Comma-separated list of allowed CORS origins
- `MAX_RECONNECT_ATTEMPTS` - Maximum reconnection attempts (default: 5)

## API Endpoints

### GET /
Health check endpoint

### GET /status
Get WhatsApp connection status

### GET /qr
Get QR code for WhatsApp authentication

### GET /session
Get current session data

### POST /send
Send WhatsApp message
```json
{
  "to": "phone_number",
  "message": "Your message text"
}
```

### POST /disconnect
Disconnect WhatsApp session

### POST /refresh-session
Refresh current session

## Deployment to Render

1. Create a new Web Service on Render
2. Connect your GitHub repository
3. Set build command: `npm install`
4. Set start command: `npm start`
5. Add environment variables as needed
6. Deploy!

## Local Development

```bash
npm install
npm start
```

The server will start on port 3000 (or PORT environment variable).

## License

MIT License
