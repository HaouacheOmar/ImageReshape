from django.urls import path
from .views import CropImageView, ResizeImageView, RemoveBackgroundView

urlpatterns = [
    path('crop/', CropImageView.as_view(), name='crop-image'),
    path('resize/', ResizeImageView.as_view(), name='resize-image'),
    path('remove/', RemoveBackgroundView.as_view(), name='remove-bg'),
]