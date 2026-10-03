# Putting CubeRush online

This guide explains what "deploying" means for CubeRush, what each file in the repo is for, and
two ways to do it. Nothing here has been done for you: every command is yours to run when you're
ready. Read it top to bottom once before starting.

## 1. The big picture

CubeRush in production is **one program and one file**:

- **The program** is the Node server (`apps/server`). It answers the API (`/api/...`) _and_ hands out
  the built web app (`apps/web/dist`), so there's nothing else to run.
- **The file** is the SQLite database (`cuberush.db`). Every player, solve and purchase lives in it.

To put that online you need:

| You need                         | Why                                                                            |
| -------------------------------- | ------------------------------------------------------------------------------ |
| A computer that's always on      | Your PC sleeps and changes networks. A rented server (a "host") doesn't.       |
| A **disk that survives restarts** | Lose the disk, lose every player. Some free hosts wipe files on each deploy.  |
| **HTTPS**                        | Browsers warn on plain `http://`, and the login token must not travel in clear text. |
| **Backups**                      | Copies of `cuberush.db` somewhere else, for the day something breaks.          |
| **One copy** of the server       | SQLite is one file on one disk; two servers would each have their own data.    |

## Does it cost money?

Short answer: **yes, a little, probably a few dollars a month.** Hosting that keeps a disk and runs
non-stop is rarely free any more. Prices change, so treat these as rough (checked October 2026)
and confirm on each site before signing up:

| Option                  | Roughly                                                                                         |
| ----------------------- | ----------------------------------------------------------------------------------------------- |
| **Your own PC**         | Free. Docker on your PC (section 4) is the free way to learn; nobody else can reach it, though. |
| **Fly.io**              | No real free tier since late 2024; trial credit, then pay-as-you-go. A small always-on machine is about $2–4/month, a 1 GB volume about $0.15/month. A card is needed. |
| **Hetzner (VPS)**       | Around €6/month for a small server, and sometimes sold out in some regions.                     |
| **Oracle Cloud "Always Free"** | $0, but the free allowance has shrunk, capacity is hard to get, and the sign-up is picky. A card is needed for identity checks. |
| **A domain name**       | Optional, about $10–15/year. A free address like `yourapp.fly.dev` comes with Fly.             |

Things that **don't** work for CubeRush even though they're free: Vercel and Netlify (serverless:
no disk that survives, see below), and free plans that sleep the app or wipe the disk. A wiped disk
means every player lost.

**Why not Vercel?** It runs code as short-lived functions on a throw-away disk, so a SQLite file
would be lost, and several copies could run at once. CubeRush needs one long-running server with a
real disk.

**My suggestion:** learn on your own PC (free), then when you're ready put it on Fly.io and watch
the first month's bill in their dashboard. Set a spending alert if the site offers one.

## 2. Words you'll meet

- **Host / server:** a computer in a data center you rent. Two kinds:
  - **VPS** (virtual private server): a bare Linux machine you control fully. More to learn, cheapest, most flexible.
  - **PaaS** (platform as a service, e.g. Fly.io, Railway, Render): you hand over your code and they run it. Less to learn.
- **Docker image:** a packaged, ready-to-run copy of the app _plus_ the Linux and Node it needs. Built
  from the `Dockerfile`. "It works on my machine" becomes "it works in this image", anywhere.
- **Container:** a running image. You can stop it, delete it and start a new one from the same image.
- **Volume:** a folder that lives _outside_ the container, so data survives when the container is
  replaced. CubeRush keeps its database in a volume mounted at `/data`.
- **Port:** a numbered door on a computer. The server listens on `3000` inside the container;
  `-p 8080:3000` means "door 8080 on my machine leads to door 3000 in the container".
- **Reverse proxy:** a program in front of your app (Caddy, Nginx, or the host's own) that handles
  HTTPS and passes requests on. Behind one, set `TRUST_PROXY=1` so rate limits see each player's
  real address instead of the proxy's.
- **Environment variables:** settings passed to a program from outside (`PORT`, `DATABASE_PATH`...).
  The server's are listed in the README.
- **CI** (continuous integration): GitHub running your checks on every push. See section 7.

## 3. What's in the repo for this

| File                       | What it does                                                                         |
| -------------------------- | ------------------------------------------------------------------------------------ |
| `Dockerfile`               | Recipe for the image. Read its comments, every step is explained.                    |
| `.dockerignore`            | Keeps `node_modules`, builds and **your local database** out of the image.           |
| `apps/server/src/backup.ts` | `npm run backup` makes a safe copy of the database, keeping the newest 14.           |
| `/api/health`              | Answers `{"ok":true}`; Docker and hosts use it to check the server is alive.         |
| `.github/workflows/ci.yml` | Runs typecheck, lint, format check, tests and build on every push to `main`.         |

How the `Dockerfile` works, in short:

1. **Build stage:** start from Linux + Node 22, install all packages, build the web app, then remove
   the development-only packages.
2. **Run stage:** start fresh, copy in only what's needed to run, make `/data` a volume, switch to a
   non-root user, and start the server.

Two stages keep the final image small and free of build tools.

## 4. Try it on your own PC first

This is the best way to learn, and costs nothing. You need **Docker Desktop**
(<https://www.docker.com/products/docker-desktop/>). Start it, wait for it to say it's running, then
in a terminal at the repo root:

```sh
# 1. Build the image and call it "cuberush". Takes a few minutes the first time.
docker build -t cuberush .

# 2. Run it: door 8080 on your PC → door 3000 in the container, database in a volume.
docker run -d --name cuberush -p 8080:3000 -v cuberush-data:/data cuberush
```

Open <http://localhost:8080>, pick a nickname and solve a cube. Then see what you just learned:

```sh
docker ps                     # running containers: cuberush should say "healthy" after ~30 s
docker logs cuberush          # the server's output
docker stop cuberush          # stop it...
docker rm cuberush            # ...and delete the container entirely
docker run -d --name cuberush -p 8080:3000 -v cuberush-data:/data cuberush   # a brand-new one
```

Reload the page: you're still signed in with your points, because the database was in the
**volume**, not the container. That is the single most important idea in this guide.

Make a backup inside the running container and copy it out:

```sh
docker exec cuberush /app/node_modules/.bin/tsx src/backup.ts
docker cp cuberush:/data/backups ./backups
```

(`docker volume rm cuberush-data` deletes the practice data when you're done.)

## 5. Option A: a platform with a volume (easiest)

Fly.io is a good fit: it runs your `Dockerfile` as-is and offers volumes. Railway and Render work
similarly; look for "volume" or "persistent disk" in their docs. Check current pricing on their
sites: it changes, and the free tiers come and go.

The shape of it on Fly.io:

1. Install their command-line tool (`flyctl`) and sign up: <https://fly.io/docs/flyctl/install/>.
2. At the repo root, run `fly launch`. It finds the `Dockerfile` and writes a `fly.toml`. Say **no**
   to databases it offers (you have SQLite).
3. Create a volume for the database: `fly volumes create cuberush_data --size 1`
4. Edit `fly.toml` so it has these parts:

   ```toml
   [env]
     TRUST_PROXY = "1"          # Fly's proxy sits in front of the app

   [mounts]
     source = "cuberush_data"   # the volume from step 3...
     destination = "/data"      # ...where the database lives

   [http_service]
     internal_port = 3000
     force_https = true         # Fly provides the HTTPS certificate
   ```

5. `fly deploy`, then `fly open`.
6. Keep it to **one machine** (`fly scale count 1`): the volume belongs to one machine, and SQLite
   to one server.

Backups: `fly ssh console -C "/app/node_modules/.bin/tsx /app/apps/server/src/backup.ts"`, and
copy the files to your PC with `fly ssh sftp get`. Fly also snapshots volumes daily, but your own
copy off their platform is the one you control.

## 6. Option B: your own Linux server (most to learn)

A small VPS (Hetzner, DigitalOcean, Linode... the cheapest plan is plenty) with Ubuntu, plus a
domain name. Roughly:

1. **Connect:** `ssh root@<server-ip>`. Create a normal user and set up SSH keys (each provider
   has a guide). Turn on the firewall, letting through only SSH and web traffic:
   `ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw enable`
2. **Install Docker:** follow <https://docs.docker.com/engine/install/ubuntu/>.
3. **Get the code and build:** `git clone https://github.com/Erik-Jashari/CubeRush.git`, then
   `cd CubeRush && docker build -t cuberush .`
4. **Run it**, reachable only from the server itself (Caddy will be the way in), restarting on reboot:

   ```sh
   docker run -d --name cuberush --restart unless-stopped \
     -p 127.0.0.1:3000:3000 -v cuberush-data:/data -e TRUST_PROXY=1 cuberush
   ```

5. **Point your domain at the server:** at your domain registrar, add an `A` record for, say,
   `cube.yourdomain.com` with the server's IP address.
6. **HTTPS with Caddy:** install it (<https://caddyserver.com/docs/install>) and put this in
   `/etc/caddy/Caddyfile`:

   ```
   cube.yourdomain.com {
       reverse_proxy 127.0.0.1:3000
   }
   ```

   `systemctl reload caddy`. Caddy fetches and renews the HTTPS certificate by itself.

7. **Daily backups:** `crontab -e` and add (3:00 every night):

   ```
   0 3 * * * docker exec cuberush /app/node_modules/.bin/tsx src/backup.ts
   ```

   The copies land in the volume, on the same disk. Now and then, copy them to your PC:
   `scp -r <user>@<server-ip>:/var/lib/docker/volumes/cuberush-data/_data/backups ./backups`
   (or `docker cp` on the server first). A backup on the same disk doesn't survive that disk.

## 7. Day-to-day

**CI.** After you push to GitHub, open the repo's **Actions** tab. Every push gets a run; a red ✗
means a check failed, and clicking it shows which step and why. Fix it before deploying.

**Updating the live site.** Back up first. Then build a new image and swap the container; the
volume (and so every player) stays. Database changes in a new version (migrations) run by
themselves when the server starts.

- Fly.io: `fly deploy`
- VPS: `git pull && docker build -t cuberush . && docker stop cuberush && docker rm cuberush`, then
  the same `docker run` as in step 4.

**Restoring a backup** (VPS; the idea is the same anywhere): stop the server, put the backup in
place of `cuberush.db` (deleting any `cuberush.db-wal` and `cuberush.db-shm` beside it), start
again.

```sh
docker stop cuberush
docker run --rm --user node -v cuberush-data:/data node:22-bookworm-slim \
  sh -c "cp /data/backups/cuberush-<time>.db /data/cuberush.db && rm -f /data/cuberush.db-wal /data/cuberush.db-shm"
docker start cuberush
```

## 8. Before you share the link

- [ ] HTTPS works (the padlock shows).
- [ ] `TRUST_PROXY=1` is set (you're behind a proxy in both options).
- [ ] The database is on a volume: replace the container once and check your account survives.
- [ ] Backups run, and you've copied one to your own PC and opened it.
- [ ] Only one copy of the server is running.
- [ ] CI is green on `main`.
