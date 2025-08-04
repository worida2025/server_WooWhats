# Deployment Guide for Render.com

This guide will help you deploy the WooWhats server to Render.com for production use.

## Prerequisites

1. A GitHub account
2. A Render.com account
3. Your WooWhats server code pushed to a GitHub repository

## Step 1: Prepare Your Repository

1. **Create a new GitHub repository** for your WooWhats server
2. **Push the contents** of the `woowhats-server-render` folder to your repository
3. **Ensure your repository structure** looks like this:
   ```
   your-repo/
   ├── server.js
   ├── package.json
   ├── README.md
   ├── .env.example
   ├── .gitignore
   └── deployment-guide.md
   ```

## Step 2: Deploy to Render

1. **Go to Render Dashboard**: https://dashboard.render.com
2. **Click "New +"** in the top right
3. **Select "Web Service"**
4. **Connect your GitHub repository**:
   - Click "Connect account" if you haven't linked GitHub
   - Select your WooWhats server repository
   - Click "Connect"

## Step 3: Configure Your Service

Fill in the deployment settings:

### Basic Settings
- **Name**: `woowhats-server` (or your preferred name)
- **Environment**: `Node`
- **Region**: Choose the closest to your users
- **Branch**: `main` (or your default branch)
- **Root Directory**: Leave empty (unless your server code is in a subdirectory)

### Build & Deploy Settings
- **Build Command**: `npm install`
- **Start Command**: `npm start`

### Environment Variables

Click "Advanced" and add these environment variables:

| Key | Value | Description |
|-----|-------|-------------|
| `NODE_ENV` | `production` | Set to production mode |
| `MAX_RECONNECT_ATTEMPTS` | `5` | Maximum WhatsApp reconnection attempts |
| `WHATSAPP_SESSION_PATH` | `/tmp/wwebjs_auth` | Session storage path (use /tmp on Render) |
| `ALLOWED_ORIGINS` | `https://yourdomain.com` | Your WordPress site URL (replace with actual domain) |

**Important**: Replace `https://yourdomain.com` with your actual WordPress site URL. For multiple domains, separate with commas:
`https://yourdomain.com,https://www.yourdomain.com`

### Instance Type
- **Free Tier**: Good for testing and low traffic
- **Starter ($7/month)**: Recommended for production use
- **Standard**: For high traffic applications

## Step 4: Deploy

1. **Click "Create Web Service"**
2. **Wait for deployment** (this takes 2-5 minutes)
3. **Your service URL** will be available once deployed (e.g., `https://your-service-name.onrender.com`)

## Step 5: Test Your Deployment

1. **Visit your service URL** - you should see a health check response
2. **Test the status endpoint**: `https://your-service-name.onrender.com/status`
3. **Test QR generation**: `https://your-service-name.onrender.com/qr`

## Step 6: Update Your WordPress Plugin

Update your WordPress WooWhats plugin settings to use your new Render URL:

1. **Go to** WordPress Admin → WooWhats → General Settings
2. **Update Server URL** to `https://your-service-name.onrender.com`
3. **Save settings**

## Important Notes

### Session Persistence
- **Sessions are stored in `/tmp`** which is ephemeral on Render
- **WhatsApp sessions will be lost** when your service restarts
- **Users will need to re-scan QR codes** after service restarts
- **Consider upgrading** to a plan with persistent storage for production use

### Auto-Sleep (Free Tier)
- **Free tier services sleep** after 15 minutes of inactivity
- **First request after sleep** takes 30+ seconds to wake up
- **Paid plans** don't have this limitation

### CORS Configuration
- **Set ALLOWED_ORIGINS** to your exact WordPress domain(s)
- **Use HTTPS** for production sites
- **Test thoroughly** to ensure cross-origin requests work

### Monitoring
- **Check your service logs** in the Render dashboard
- **Set up monitoring** for production applications
- **WhatsApp sessions** may need periodic reconnection

## Troubleshooting

### Common Issues

1. **Service won't start**:
   - Check build logs for npm install errors
   - Verify package.json is valid
   - Ensure start command is correct

2. **WhatsApp won't connect**:
   - Check service logs for Puppeteer errors
   - Verify WhatsApp Web is accessible
   - Try manually refreshing the session

3. **CORS errors**:
   - Verify ALLOWED_ORIGINS environment variable
   - Check browser developer tools for exact error
   - Ensure WordPress site is using HTTPS

4. **Session keeps disconnecting**:
   - Normal on free tier due to service sleeping
   - Consider upgrading to paid plan
   - Implement session monitoring in your WordPress plugin

### Getting Help

1. **Check Render logs** in your dashboard
2. **Review WhatsApp Web.js documentation**
3. **Test locally first** to isolate issues
4. **Contact support** if you encounter Render-specific issues

## Security Considerations

1. **Environment Variables**: Never commit sensitive data to your repository
2. **CORS**: Set specific origins instead of '*' for production
3. **Authentication**: Consider adding API authentication for production use
4. **Rate Limiting**: Implement rate limiting for public endpoints
5. **Monitoring**: Set up error tracking and monitoring

## Next Steps

After successful deployment:

1. **Test all functionality** thoroughly
2. **Set up monitoring** and alerting
3. **Document your deployment** for your team
4. **Consider backup strategies** for important data
5. **Plan for scaling** as your usage grows

Your WooWhats server should now be running on Render and ready to handle WhatsApp integrations for your WordPress site!
