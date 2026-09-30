# ImageReshape — client

Next.js frontend for the Django API in `../back`.

```bash
npm install
npm run dev            # http://localhost:3000
```

The API defaults to `http://localhost:8000`; override with `NEXT_PUBLIC_API_URL`.
Design tokens come from `Design_System/` — see `DESIGN.md`.

## Docker

From the repo root, `docker compose up -d --build` runs this client (:3000) together with the API (:8000).
To build it alone: `docker build --build-arg NEXT_PUBLIC_API_URL=http://localhost:8000 -t imagereshape-client client`.
