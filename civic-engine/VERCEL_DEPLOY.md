# Vercel Deployment Guide

Your project relies on a few keys and services to function fully.

Project/Team for MCP: https://mcp.vercel.com/2b3/public-comment-builder

## 1. Environment Variables in Vercel
Go to **Settings > Environment Variables** in your Vercel project and add:

| Variable | Description | Required? |
|----------|-------------|-----------|
| `GOOGLE_API_KEY` | Your Gemini API Key for AI generation. | **YES** |
| `NEXT_PUBLIC_APP_URL` | Your production URL (e.g. `https://your-app.vercel.app`) for SEO/Sitemap. | **YES** |
| `ADMIN_SECRET_KEY` | Set this to a secure random string to protect the `/admin/stats` page. | **YES** |
| `KV_URL` or `REDIS_URL` | Vercel KV or Upstash Redis URL. | *Optional* (Recommended for caching) |

## 2. Database (SQLite)
This project uses SQLite for statistics (`data/stats.db`). 
- **On Vercel (Serverless):** The filesystem is read-only. The app has been patched to **automatically disable stats** if it cannot write to the database file. The app will continue to work, but statistics (Total Comments, Top Dockets) will reset or not be recorded.
- **For Production Stats:** You should migrate `lib/stats-db.ts` to use Vercel Postgres or an external database service.

## 3. Caching (Redis)
- **Without Redis:** The app will work but will fetch fresh data from Regulations.gov every time (slower, may hit rate limits).
- **With Redis:** Add a Vercel KV store (or Upstash Redis) to your project. The app will automatically detect `KV_URL` and enable caching.

