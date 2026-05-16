from django.urls import path

from .views import (
    LoginAPIView,
    LogoutAPIView,
    MeAPIView,
    OAuthCallbackAPIView,
    OAuthStartAPIView,
    RefreshAPIView,
    RegisterAPIView,
)

urlpatterns = [
    path("register/", RegisterAPIView.as_view(), name="auth-register"),
    path("login/", LoginAPIView.as_view(), name="auth-login"),
    path("refresh/", RefreshAPIView.as_view(), name="auth-refresh"),
    path("logout/", LogoutAPIView.as_view(), name="auth-logout"),
    path("me/", MeAPIView.as_view(), name="auth-me"),
    path("oauth/<str:provider>/start/", OAuthStartAPIView.as_view(), name="auth-oauth-start"),
    path("oauth/<str:provider>/callback/", OAuthCallbackAPIView.as_view(), name="auth-oauth-callback"),
]
