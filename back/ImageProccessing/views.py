import os
import uuid
from django.conf import settings
from rest_framework import status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from .service import CropImage, RemoveBackground, ResizeImage


class ImageProcessingView(APIView):
    parser_classes = (MultiPartParser, FormParser)
    
    def SaveRespond(self, request, processedImage, ext=".jpg", action="processed"):
        filename = f"{action}_{uuid.uuid4().hex}{ext}"
        save_path = os.path.join(settings.MEDIA_ROOT, filename)
        os.makedirs(settings.MEDIA_ROOT, exist_ok=True)
        
        with open(save_path, 'wb') as f:
            f.write(processedImage)
        
        file_url = request.build_absolute_uri(f"{settings.MEDIA_URL}{filename}")

        return Response(
            {
                "image_url": file_url,
                "message": f"Image {action} successfully."
            },
            status=status.HTTP_200_OK
        )

    def ValidateImage(self, request):
        """Always returns a tuple: (image_bytes, error_response)"""
        if 'image' not in request.FILES:
            return None, Response({"error": "No image file provided."}, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            image_bytes = request.FILES['image'].read()
            return image_bytes, None
        except Exception as e:
            return None, Response({"error": f"failed to read image file: {str(e)}"}, status=status.HTTP_400_BAD_REQUEST)


class CropImageView(ImageProcessingView):
    def post(self, request, *args, **kwargs):
        Valres, Errres = self.ValidateImage(request)
        if Errres:
            return Errres
        
        try:
            params = {
                'x': request.data.get('x', 0),
                'y': request.data.get('y', 0),
                'w': request.data.get('w', None),
                'h': request.data.get('h', None)
            }
            processedImage = CropImage(Valres, params)
            return self.SaveRespond(request, processedImage, ext=".jpg", action="cropped")
        except Exception as e:
            return Response({"error": f"failed to crop image: {str(e)}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class ResizeImageView(ImageProcessingView):
    def post(self, request, *args, **kwargs):
        Valres, Errres = self.ValidateImage(request)
        if Errres:
            return Errres
        
        try:
            params = {
                'width': request.data.get('width', None),
                'height': request.data.get('height', None)
            }
            processedImage = ResizeImage(Valres, params)
            return self.SaveRespond(request, processedImage, ext=".jpg", action="resized")
        except Exception as e:
            return Response({"error": f"failed to resize image: {str(e)}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class RemoveBackgroundView(ImageProcessingView):
    def post(self, request, *args, **kwargs):
        Valres, Errres = self.ValidateImage(request)
        if Errres:
            return Errres
        
        try:
            processedImage = RemoveBackground(Valres)
            return self.SaveRespond(request, processedImage, ext=".png", action="background_removed")
        except Exception as e:
            return Response({"error": f"failed to remove background: {str(e)}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)