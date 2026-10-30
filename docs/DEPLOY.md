# Putting it online

## While testing: Supabase free plan

Costs nothing. 500 MB of database, far more than 5,000 visitors a year needs. Two things to know:
there are no backups, and the project pauses after a week with no activity (one click to wake it).

## For daily office use

Two parts to host: the **API** (Node) and the **web app** (static files).

### Hostinger KVM 2

```bash
# on the server, once
sudo apt update && sudo apt install -y nodejs npm nginx
git clone <your repo> /var/www/archpoint-vms && cd /var/www/archpoint-vms
npm run setup
cp backend/.env.example backend/.env    # then fill in DATABASE_URL and the Supabase keys
npm run build
```

Keep the API running with a service manager:

```bash
sudo npm install -g pm2
pm2 start "npm start" --name archpoint-api --cwd /var/www/archpoint-vms/backend
pm2 save && pm2 startup
```

Serve the built web app and pass `/api` to the API:

```nginx
server {
  listen 80;
  server_name visitors.archpoint.in;
  root /var/www/archpoint-vms/frontend/dist;

  location / { try_files $uri /index.html; }
  location /api/ { proxy_pass http://127.0.0.1:4000; proxy_set_header Host $host; }
}
```

Then add HTTPS, which is free and takes a minute:

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d visitors.archpoint.in
```

Set `CORS_ORIGIN=https://visitors.archpoint.in` in `backend/.env` and restart with `pm2 restart archpoint-api`.

### Checklist before the team starts using it

- [ ] Public sign-up turned off in Supabase (Authentication → Sign In / Providers → Email)
- [ ] The first Admin account created, and the Supabase database password saved somewhere safe
- [ ] `backend/.env` is not in GitHub
- [ ] HTTPS working, and the site only reachable over `https://`
- [ ] A backup in place: Supabase Pro for daily backups, or a weekly `pg_dump "$DATABASE_URL" > backup-$(date +%F).sql`
- [ ] Sample data removed: `npm run samples:clear`

## Moving the database off Supabase later

The API talks to plain Postgres through `DATABASE_URL`, so moving to a database on the Hostinger
server is a dump, a restore and one changed line. Only sign-in stays with Supabase; swapping that
means replacing `backend/src/auth/verifier.ts` and the sign-in call in `frontend/src/auth.tsx`.

## Vercel (web app) + Render (API)

**1. API on Render.** New → Blueprint → pick the repo (it reads `render.yaml`), or New → Web Service with
Root Directory `backend`, Build `npm ci`, Start `npm start`, Health check `/api/health`.
Set the secrets: `DATABASE_URL` (Supabase session pooler string), `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
and `CORS_ORIGIN` = your Vercel address (e.g. `https://archpoint-vms.vercel.app`, no trailing slash).
Note the service address, e.g. `https://archpoint-vms-api.onrender.com`.

**2. Web app on Vercel.** Add New → Project → pick the repo, Root Directory `frontend`, framework Vite.
Environment variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, and
`VITE_API_BASE` = the Render address (no trailing slash, no `/api`). Deploy.

**3. Supabase.** Authentication → URL Configuration: set Site URL to the Vercel address.

Render's free plan sleeps after 15 minutes idle, so the first check-in of the day waits about a minute.
Use the paid Starter plan for the front desk, or ping `/api/health` every 10 minutes.
