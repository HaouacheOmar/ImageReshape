# ImageReshape

Upload an image, then crop it, resize it or remove its background, all in the browser.

- **`back/`** — Django + Django REST Framework API. The image processing uses OpenCV.
- **`client/`** — Next.js frontend. It's styled from `client/Design_System/` and animated with Motion.

## Quick start

Requires Docker.

```bash
docker compose up -d --build
```

- App: http://localhost:3000
- API: http://localhost:8000

Stop it with `docker compose down`.

## Using the app

1. Drop an image on the page, or click **browse your files**.
2. Pick an operation:
   - **Crop:** drag across the image to draw the area, or type the values.
   - **Resize:** drag the right edge, bottom edge or corner of the frame, or type the width and height. **Aspect ratio** locks or frees the proportions.
   - **Remove background:** returns a transparent PNG. It works best when the subject is near the centre.
3. Click **Apply**. You can then compare **Original** and **Result**, **Download** the result, or **Keep editing result** to use it as the new source.

## Local development

Backend (Python 3.12+):

```bash
cd back
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver        # http://localhost:8000
```

Frontend (Node 22+):

```bash
cd client
npm install
npm run dev                       # http://localhost:3000
```

The client calls the API at `http://localhost:8000` by default. To use a different address, set `NEXT_PUBLIC_API_URL`. In Docker this is a build argument in `docker-compose.yml`, and it must be an address your browser can reach.

## API

All endpoints take `POST` with `multipart/form-data`, and the file goes in the field `image`.

| Endpoint | Fields | Returns |
|---|---|---|
| `/api/crop/` | `x`, `y`, `w`, `h` (pixels) | JPEG |
| `/api/resize/` | `width`, `height` (pixels) | JPEG |
| `/api/remove/` | — | PNG with transparency |

A successful response looks like `{"image_url": "http://localhost:8000/media/<file>", "message": "..."}`. An error looks like `{"error": "..."}`.

```bash
curl -F image=@photo.jpg -F width=800 -F height=600 http://localhost:8000/api/resize/
```

## Known limitations

- The backend settings are for development only: `DEBUG=True`, a hardcoded `SECRET_KEY`, and `ALLOWED_HOSTS=['*']`.
- Crop without `w`/`h`, or resize without `width`/`height`, returns a 500. The client always sends every field, so this only affects direct API calls.
- Processed images are stored inside the backend container and are lost when the container is recreated. Add a volume for `back/media` to keep them.
