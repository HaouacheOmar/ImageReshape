# ImageReshape

Image editing web app: upload an image, crop / resize / remove its background.

## Layout

- `back/` — Django 6.1 + Django REST Framework API. The only app is `ImageProccessing` (the misspelling is the real name; don't "fix" it, since imports and `INSTALLED_APPS` depend on it).
- `client/` — Next.js 16 (App Router, TypeScript, Tailwind v4) frontend. `client/AGENTS.md` warns that this Next version differs from training data; check `client/node_modules/next/dist/docs/` before using Next APIs.
- `client/Design_System/` — the design source of truth: `DESIGN.md`, `tokens.json`, `variables.css`, `theme.css`. Read `DESIGN.md` before touching UI.

## Frontend

- It's a single page (`src/app/page.tsx`) with three components: `Hero` (headline plus `Constellation`, the animated triangle-particle brain), and `Editor` (upload → op tabs → params → Apply → compare/download/keep editing).
- Design tokens get into Tailwind through `@import "../../Design_System/theme.css"` in `globals.css`. Never redefine tokens in the app; edit `Design_System/` instead. The named spacing keys are literal pixels (`p-24` = 24px, `gap-60` = 60px).
- Font: PPNeueMontreal is licensed, so Inter (200/400/600) loads through `next/font` as the substitute. Body copy uses weight 200 and headlines 400. Nothing is ever bold.
- Design rules to keep: pure black background everything; no cards, borders or shadows; the violet `#8052ff` fill only on the single primary button per view; amber `#ffb829` for labels, links and errors; radius 24px. The one deliberate exception is the thin underline on number inputs, which is there for accessibility.
- **All animation uses Motion (`motion/react`), not CSS transitions or keyframes.** Every animation respects `useReducedMotion`. Watch for this gotcha: an infinitely repeating transition on a keyed `AnimatePresence` child makes its exit never finish, so put looping animations on a wrapper instead.
- Interactivity is concentrated in two places, on purpose:
  - **`Constellation`:** particles are pushed away from the pointer, a click sends out a shockwave, and the whole cloud tilts toward the cursor. There's one shared pointer/power `MotionValue` set, and each particle derives its offset with `useTransform`, so nothing re-renders in React. Don't add per-particle springs or state; ~310 particles depend on this staying cheap.
  - **`Editor`:** drag on the image to draw the crop box, and a click without a drag resets to the full image. In resize mode the image wrapper becomes the frame: drag the right edge, the bottom edge or the corner (it follows the ratio lock). Display scale `k` = min(1, 80% of the room / image size). The frame can only grow to the column width and 85vh, so the largest size you can reach by dragging is room / k. Typed values have no limit.
  Keep everything else quiet. Don't add magnetic buttons, per-section scroll reveals or hover effects on everything.
- File picking goes through one hidden `<input type="file">` (`fileRef`) opened by `openPicker()` from the "browse your files" button and the drop zone. "New image" calls `reset()`, which returns to the empty drop zone; it does not open the picker. Don't go back to `<label htmlFor>` wrapped around its own input. It was unreliable, and the input value is reset after each pick so choosing the same file again still works.
- The API base URL comes from `NEXT_PUBLIC_API_URL` (default `http://localhost:8000`). The editor always sends every crop/resize param, which sidesteps the backend `None` bug.
- Run: `cd client && npm run dev` (port 3000, which matches backend CORS). Check with `npm run lint && npx tsc --noEmit`.

## Backend

- Endpoints (all `POST`, multipart, file field `image`), in `back/ImageProccessing/urls.py`:
  - `/api/crop/`: `x`, `y`, `w`, `h`
  - `/api/resize/`: `width`, `height`
  - `/api/remove/`: no params; uses OpenCV GrabCut and returns a PNG with an alpha channel
- Response: `{"image_url": "<absolute url>", "message": "..."}`. Errors come back as `{"error": "..."}`.
- The image processing is plain OpenCV/numpy in `service.py`. The views in `views.py` share the `ImageProcessingView` base, which handles validation and the save-and-respond step.
- Results are written to `back/media/` and served at `/media/` through `static()`. That only works while `DEBUG=True`.
- There are no DB models. SQLite is used only by Django's built-in apps.
- CORS allows `http://localhost:3000` and `http://127.0.0.1:3000`. That's where the client is expected to run.

## Running

- Whole stack: `docker compose up -d --build` from the repo root. That starts `back` on :8000 and `client` on :3000.
  - `NEXT_PUBLIC_API_URL` is a build arg that gets inlined into the browser bundle. It must be a URL the *browser* can reach (`http://localhost:8000`), not `http://back:8000`. Change it, then rebuild the client.
  - The client image uses `output: "standalone"` in `next.config.ts` on `node:24-alpine` and runs as the `node` user.
  - `package-lock.json` must contain the Linux-only optional packages (`@emnapi/*`), or `npm ci` fails in Docker. If a lock file regenerated on Windows breaks the build, refresh it inside Linux: `docker run --rm -v <client>/package.json:/app/package.json -v <client>/package-lock.json:/app/package-lock.json -w /app node:24-alpine npm install --package-lock-only --ignore-scripts`.
- Backend only (Docker):
  `docker build -t imagereshape-back back && docker run -p 8000:8000 imagereshape-back`
  The container runs `migrate`, then gunicorn on port 8000. Images in `media/` don't survive a restart because there's no volume.
- Local: `cd back && pip install -r requirements.txt && python manage.py runserver`
- Dependencies live in `back/requirements.txt`. Use `opencv-python-headless`, not `opencv-python`, because the slim image has no libGL.
- On Windows, if `docker` can't connect, start Docker Desktop first.

## Known issues (not fixed yet)

- Crop without `w`/`h`, or resize without `width`/`height`, returns a 500. The views pass an explicit `None` and `service.py` calls `int(None)`.
- The resize defaults are swapped: a missing `width` defaults to the image height, and a missing `height` to its width.
- The settings aren't production-safe: `DEBUG=True`, a hardcoded `SECRET_KEY`, `ALLOWED_HOSTS=['*']`.
- `tests.py` is empty.

## Conventions

- Keep it minimal. Don't add abstractions, dependencies or files that the task doesn't need.
- New image operations follow the existing pattern: a function in `service.py` that takes `(image_bytes, params)` and returns encoded bytes, a subclass of `ImageProcessingView`, and a route in `urls.py`.
- Update this file when the architecture, endpoints or run steps change.
