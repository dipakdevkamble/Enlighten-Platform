from urllib.parse import urlencode

import requests
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core import signing
from django.shortcuts import redirect
from rest_framework import permissions, status
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenRefreshView

from .serializers import LoginSerializer, RegisterSerializer, UserSerializer

User = get_user_model()


def _auth_response(user):
    refresh = RefreshToken.for_user(user)
    return {
        "access": str(refresh.access_token),
        "refresh": str(refresh),
        "user": UserSerializer(user).data,
    }


def _build_oauth_state(provider: str, next_url: str) -> str:
    return signing.dumps({"provider": provider, "next": next_url})


def _parse_oauth_state(state: str, provider: str) -> dict:
    try:
        data = signing.loads(state, max_age=300)
    except signing.BadSignature as exc:
        raise ValidationError("Invalid OAuth state.") from exc

    if data.get("provider") != provider:
        raise ValidationError("OAuth provider mismatch.")
    return data


def _provider_config(provider: str) -> dict:
    if provider == "google":
        return {
            "client_id": settings.GOOGLE_OAUTH_CLIENT_ID,
            "client_secret": settings.GOOGLE_OAUTH_CLIENT_SECRET,
            "auth_url": "https://accounts.google.com/o/oauth2/v2/auth",
            "token_url": "https://oauth2.googleapis.com/token",
            "scope": "openid email profile",
            "userinfo_url": "https://www.googleapis.com/oauth2/v3/userinfo",
        }
    if provider == "github":
        return {
            "client_id": settings.GITHUB_OAUTH_CLIENT_ID,
            "client_secret": settings.GITHUB_OAUTH_CLIENT_SECRET,
            "auth_url": "https://github.com/login/oauth/authorize",
            "token_url": "https://github.com/login/oauth/access_token",
            "scope": "read:user user:email",
            "userinfo_url": "https://api.github.com/user",
            "emails_url": "https://api.github.com/user/emails",
        }
    raise ValidationError("Unsupported OAuth provider.")


def _redirect_uri(provider: str) -> str:
    return f"{settings.BACKEND_BASE_URL.rstrip('/')}/api/auth/oauth/{provider}/callback/"


def _exchange_code_for_token(provider: str, code: str, cfg: dict) -> str:
    redirect_uri = _redirect_uri(provider)
    if provider == "google":
        response = requests.post(
            cfg["token_url"],
            data={
                "code": code,
                "client_id": cfg["client_id"],
                "client_secret": cfg["client_secret"],
                "redirect_uri": redirect_uri,
                "grant_type": "authorization_code",
            },
            timeout=10,
        )
        response.raise_for_status()
        access_token = response.json().get("access_token")
    else:
        response = requests.post(
            cfg["token_url"],
            data={
                "code": code,
                "client_id": cfg["client_id"],
                "client_secret": cfg["client_secret"],
                "redirect_uri": redirect_uri,
            },
            headers={"Accept": "application/json"},
            timeout=10,
        )
        response.raise_for_status()
        access_token = response.json().get("access_token")

    if not access_token:
        raise ValidationError("OAuth token exchange failed.")
    return access_token


def _fetch_identity(provider: str, access_token: str, cfg: dict) -> dict:
    if provider == "google":
        response = requests.get(
            cfg["userinfo_url"],
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=10,
        )
        response.raise_for_status()
        profile = response.json()
        email = profile.get("email")
        first_name = profile.get("given_name", "")
        last_name = profile.get("family_name", "")
    else:
        response = requests.get(
            cfg["userinfo_url"],
            headers={"Authorization": f"Bearer {access_token}", "Accept": "application/vnd.github+json"},
            timeout=10,
        )
        response.raise_for_status()
        profile = response.json()
        email = profile.get("email")
        if not email:
            emails_response = requests.get(
                cfg["emails_url"],
                headers={"Authorization": f"Bearer {access_token}", "Accept": "application/vnd.github+json"},
                timeout=10,
            )
            emails_response.raise_for_status()
            for item in emails_response.json():
                if item.get("primary") and item.get("verified"):
                    email = item.get("email")
                    break
                if not email and item.get("verified"):
                    email = item.get("email")
        first_name = profile.get("name", "") or profile.get("login", "")
        last_name = ""

    if not email:
        raise ValidationError("No verified email found from OAuth provider.")
    return {"email": email, "first_name": first_name, "last_name": last_name}


class RegisterAPIView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return Response(_auth_response(user), status=status.HTTP_201_CREATED)


class LoginAPIView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = LoginSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        return Response(_auth_response(serializer.validated_data["user"]))


class LogoutAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        refresh_token = request.data.get("refresh")
        if not refresh_token:
            raise ValidationError("Refresh token is required.")
        try:
            token = RefreshToken(refresh_token)
            token.blacklist()
        except Exception as exc:
            raise ValidationError("Invalid refresh token.") from exc
        return Response(status=status.HTTP_204_NO_CONTENT)


class MeAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        return Response(UserSerializer(request.user).data)


class OAuthStartAPIView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request, provider: str):
        if provider == "google":
            cfg = _provider_config("google")
            if not cfg.get("client_id") or not cfg.get("client_secret"):
                raise ValidationError("Google OAuth is not configured.")
            params = {
                "client_id": cfg["client_id"],
                "redirect_uri": _redirect_uri("google"),
                "scope": cfg["scope"],
                "state": _build_oauth_state("google", settings.FRONTEND_OAUTH_REDIRECT_URL),
            }
            params["response_type"] = "code"
            params["prompt"] = "consent"
            return redirect(f"https://accounts.google.com/o/oauth2/v2/auth?{urlencode(params)}")

        if provider == "github":
            cfg = _provider_config("github")
            if not cfg.get("client_id") or not cfg.get("client_secret"):
                raise ValidationError("GitHub OAuth is not configured.")
            params = {
                "client_id": cfg["client_id"],
                "redirect_uri": _redirect_uri("github"),
                "scope": cfg["scope"],
                "state": _build_oauth_state("github", settings.FRONTEND_OAUTH_REDIRECT_URL),
            }
            return redirect(f"https://github.com/login/oauth/authorize?{urlencode(params)}")

        raise ValidationError("Unsupported OAuth provider.")


class OAuthCallbackAPIView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request, provider: str):
        code = request.query_params.get("code")
        state = request.query_params.get("state")
        if not code or not state:
            raise ValidationError("OAuth callback is missing code or state.")

        cfg = _provider_config(provider)
        if not cfg.get("client_id") or not cfg.get("client_secret"):
            raise ValidationError(f"{provider.capitalize()} OAuth is not configured.")

        state_data = _parse_oauth_state(state, provider)
        access_token = _exchange_code_for_token(provider, code, cfg)
        identity = _fetch_identity(provider, access_token, cfg)

        user, created = User.objects.get_or_create(
            email=identity["email"],
            defaults={
                "first_name": identity.get("first_name", ""),
                "last_name": identity.get("last_name", ""),
                "is_active": True,
            },
        )
        if created:
            user.set_unusable_password()
            user.save(update_fields=["password"])

        tokens = _auth_response(user)
        redirect_target = settings.FRONTEND_OAUTH_REDIRECT_URL
        params = urlencode(
            {
                "access": tokens["access"],
                "refresh": tokens["refresh"],
                "email": user.email,
            }
        )
        return redirect(f"{redirect_target}#{params}")


class RefreshAPIView(TokenRefreshView):
    permission_classes = [permissions.AllowAny]
