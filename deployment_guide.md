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

## 4️⃣ Initialize Render Blueprint

```bash
render blueprint init
```

When prompted:
- Select your GitHub repository
- Choose the Frankfurt region (eu-central)
- Confirm the service configuration

## 5️⃣ Set Environment Variables

Replace `YOUR_NEON_DATABASE_URL` with your actual Neon PostgreSQL connection string:

```bash
render env set DATABASE_URL "postgresql://username:password@hostname:port/database?sslmode=require"
```

**Note:** PORT and GIN_MODE are already configured in render.yaml, so no need to set them manually.

## 6️⃣ Deploy

```bash
render blueprint deploy
```

## 7️⃣ Monitor Deployment

```bash
# Check deployment status
render services list

# View logs
render logs follow <service-name>
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