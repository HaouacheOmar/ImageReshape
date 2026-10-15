# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

ImageReshape: upload an image, then crop, resize or remove its background. Two independent apps talk over HTTP:

- `back/`: Django + DRF API, image processing with OpenCV.
- `client/`: Next.js 16 (App Router, React 19, Tailwind v4, Motion) single page.

## Commands

```bash
# Everything (app :3000, API :8000)
docker compose up -d --build
docker compose down

# Backend (Python 3.12+)
cd back
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver                 # :8000
python manage.py test ImageProccessing     # tests.py is currently empty
python manage.py test ImageProccessing.tests.SomeTest.test_method   # single test

# Frontend (Node 22+)
cd client
npm install
npm run dev        # :3000
npm run build      # also type-checks
npm run lint
```

## Architecture

**Request flow.** `client/src/components/Editor.tsx` holds all editor state. On Apply it POSTs `multipart/form-data` (file in field `image`, plus `x,y,w,h` for crop or `width,height` for resize) to `${NEXT_PUBLIC_API_URL}/api/{crop|resize|remove}/`. The op id in the client is the URL segment. The API writes the result to `back/media/` and returns `{"image_url", "message"}` or `{"error"}`. The client then fetches `image_url` for display, download, or "Keep editing result" (which turns the result into the new source `File`).

**Backend layering.** `ImageProccessing/` (note the misspelling; it's the real app name, don't "fix" it in one place):
- `views.py`: `ImageProcessingView` base handles validation (`ValidateImage` returns `(bytes, error_response)`) and saving/responding (`SaveRespond`). Each op subclass only builds params and calls the service.
- `service.py`: pure functions `bytes + params -> encoded bytes` (OpenCV). Crop/resize output JPEG; `RemoveBackground` uses GrabCut with a fixed 10px-inset rect and outputs RGBA PNG, so it only works well for centred subjects.
- No models. SQLite exists only for Django's built-in apps. Media is served by `static()` in `config/urls.py` (DEBUG only).

Adding an operation means: a service function, a view subclass, a route in `ImageProccessing/urls.py`, and an entry in `OPS` in `Editor.tsx` whose `id` matches the route.

**Coordinates.** The client works in source-image pixels (`toImage()` maps pointer positions using the image's natural size), so the API receives real pixel values, not display pixels.

**`NEXT_PUBLIC_API_URL`** is inlined at build time and is called by the *browser*, so in Docker it's a build arg set to `http://localhost:8000`, not `http://back:8000`. CORS in `back/config/settings.py` allows only `localhost:3000` / `127.0.0.1:3000`. Add any new client origin there.

## Styling

- Design tokens live in `client/Design_System/` (`theme.css` is the Tailwind `@theme` that `globals.css` imports; `DESIGN.md` is the style reference). Don't redefine tokens in `globals.css`. Use the named tokens (`bg-void`, `text-bone-white`, `text-electric-iris`, `text-heading-lg`, etc.).
- The spacing scale is in **px names**: `px-24` means 24px and `gap-30` means 30px (base unit 6px), not Tailwind's default rem steps.
- Dark only: pure black canvas, one violet accent (`electric-iris`), amber (`saffron-spark`) for focus and emphasis. Inter is the substitute for the licensed PPNeueMontreal. Body text uses weight 200.
- Animations use `motion/react` and respect `useReducedMotion()`. `Constellation.tsx` uses a seeded PRNG so server and client renders match. Keep that if you change it.

## Known limitations (from README)

- Backend settings are dev-only (`DEBUG=True`, hardcoded `SECRET_KEY`, `ALLOWED_HOSTS=['*']`).
- Crop without `w`/`h` or resize without `width`/`height` returns a 500 (`int(None)`). The client always sends all fields.
- In Docker, processed images live inside the `back` container with no volume, so they're lost on recreate.
- `__pycache__/*.pyc` files are committed. `back/.gitignore` only ignores `venv` and `media`.
