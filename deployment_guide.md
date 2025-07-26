# Blank Notes - Render Deployment Guide

A concise guide to deploy your Go note-taking app to Render using the CLI.

## Prerequisites
- Neon PostgreSQL database ready
- GitHub repository with your code
- Dockerfile (✅ already present)

## 1️⃣ Install Render CLI

```bash
curl -fsSL https://render.com/static/cli/install.sh | bash
render login
```

## 2️⃣ Configure render.yaml

The `render.yaml` file is already created. It will use your existing Dockerfile for deployment.

## 3️⃣ Connect GitHub Repository

```bash
# Make sure your code is pushed to GitHub
git add .
git commit -m "Prepare for Render deployment"
git push origin main
```

## 4️⃣ Create Blueprint from render.yaml

Since we have a `render.yaml` file, we'll create a Blueprint using the Render Dashboard:

1. Go to [Render Dashboard](https://dashboard.render.com/)
2. Click "New" > "Blueprint"
3. Connect your GitHub repository
4. Select the main branch
5. Review and apply the Blueprint

Alternatively, you can create services directly via CLI after creating them in the Dashboard.

## 5️⃣ Set Environment Variables

After the service is created, set the DATABASE_URL:

```bash
# List services to get the service ID
render services

# Set the DATABASE_URL environment variable
render env set <SERVICE_ID> DATABASE_URL "postgresql://neondb_owner:npg_5xKJhCrMW7IN@ep-shy-brook-a2syeamk-pooler.eu-central-1.aws.neon.tech/blank-db?sslmode=require&channel_binding=require"
```

**Note:** PORT and GIN_MODE are already configured in render.yaml.

## 6️⃣ Deploy

```bash
# Trigger a new deployment
render deploys create <SERVICE_ID>
```

## 7️⃣ Monitor Deployment

```bash
# Check deployment status
render services

# View logs (after getting service ID from above)
render logs <SERVICE_ID>
```

## ✅ Post-Deployment

- Your app will be available at `https://blank-notes-<random>.onrender.com`
- Auto-deployment is enabled for future pushes to main branch
- Free tier includes 750 build minutes/month and 750 instance hours/month

## 🔧 Troubleshooting

If deployment fails:
- Check logs: `render logs <service-name>`
- Verify environment variables: `render env list`
- Ensure Dockerfile builds locally: `docker build -t blank-notes .`

## 📝 Notes

- The app uses your existing Dockerfile for containerized deployment
- Database migrations will run automatically if configured in your Go app
- HTTPS is provided by default on Render