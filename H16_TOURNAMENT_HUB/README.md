# H16 TOURNAMENT HUB

HTML, CSS and vanilla JavaScript frontend with Supabase Auth, Postgres and Storage.

## Included
- Responsive esports landing page and navigation
- Email/password registration and login
- Guild directory and guild registration (admin approval)
- Tournament listings and status filters
- Leaderboard based on guild points
- Hall of Fame
- Player dashboard
- Admin/moderator dashboard section with pending guild approval
- Supabase SQL schema with Row Level Security policies
- Private `match-evidence` storage bucket for match proof uploads

## Setup

1. Create a Supabase project.
2. Open **SQL Editor** and run `supabase/schema.sql`.
3. Open **Project Settings → API**.
4. Copy the Project URL and anon/public key.
5. Paste them into `js/config.js`:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
6. Open `index.html` using VS Code Live Server or deploy the folder to Cloudflare Pages / Netlify.
7. Register your own account.
8. In Supabase **Table Editor → profiles**, copy your profile UUID and change its role to `admin` using SQL:
   ```sql
   update public.profiles
   set role = 'admin'
   where id = 'YOUR-USER-UUID';
   ```

## Security notes
- Never put the Supabase `service_role` key in `js/config.js`.
- Public users can see approved guilds, tournaments and Hall of Fame entries.
- New users receive the `member` role automatically. Admin roles must be assigned from the trusted Supabase dashboard.
- Guild approval and tournament creation are protected by Row Level Security.
- For production, configure Supabase Auth email confirmation, redirect URLs, and SMTP.
- Match evidence bucket is private. Upload object names using `<user-uuid>/<filename>`.

## Current scope
This is the complete starter implementation for the agreed core H16 experience. Advanced bracket automation, real-time match rooms, notifications, dispute workflows, and payment/prize handling are not included yet.
