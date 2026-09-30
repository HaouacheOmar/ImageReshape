import cv2
import numpy as np

def encode_to_bytes(image_array, extension='.jpg'):
    success, buffer = cv2.imencode(extension, image_array)
    if not success:
        raise ValueError("Failed to encode image")
    return buffer.tobytes()

def CropImage(image_bytes, params):
    arr = np.frombuffer(image_bytes, np.uint8)
    image = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    img_h, img_w = image.shape[:2]

    x = max(0, int(params.get('x', 0)))
    y = max(0, int(params.get('y', 0)))
    w = int(params.get('w', img_w - x))
    h = int(params.get('h', img_h - y))
    x2 = min(x + w, img_w)
    y2 = min(y + h, img_h)

    if x >= x2 or y >= y2:
        cropped = image
    else:
        cropped = image[y:y2, x:x2]

    return encode_to_bytes(cropped, '.jpg')


def ResizeImage(image_bytes, params):
    arr = np.frombuffer(image_bytes, np.uint8)
    image = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    h, w = image.shape[:2]
    width = max(1, int(params.get('width', h)))
    height = max(1, int(params.get('height', w)))
    interpolation = cv2.INTER_AREA if (width < w or height < h) else cv2.INTER_LINEAR
    resizedImage = cv2.resize(image, (width, height), interpolation=interpolation)

    return encode_to_bytes(resizedImage, '.jpg')


def RemoveBackground(image_bytes, params=None):

    arr = np.frombuffer(image_bytes, np.uint8)
    image = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    h, w = image.shape[:2]

    mask = np.zeros((h, w), np.uint8)
    bgd_model = np.zeros((1, 65), np.float64)
    fgd_model = np.zeros((1, 65), np.float64)

    rect = (10, 10, max(1, w - 20), max(1, h - 20))

    cv2.grabCut(image, mask, rect, bgd_model, fgd_model, 5, cv2.GC_INIT_WITH_RECT)

    mask2 = np.where((mask == 2) | (mask == 0), 0, 255).astype('uint8')

    b, g, r = cv2.split(image)
    rgba = cv2.merge([b, g, r, mask2])

    return encode_to_bytes(rgba, '.png')