from django.contrib.auth import views as auth_views
from django.urls import path
from django.views.generic import TemplateView

from .forms import EmailAuthenticationForm
from .views import home, signup_view, verify_email

urlpatterns = [
    path("", home, name="home"),
    path("signup/", signup_view, name="signup"),
    path(
        "login/",
        auth_views.LoginView.as_view(
            template_name="login1.html",
            authentication_form=EmailAuthenticationForm,
            redirect_authenticated_user=True,
        ),
        name="login",
    ),
    path("logout/", auth_views.LogoutView.as_view(next_page="login"), name="logout"),
    path(
        "verify-email/<uidb64>/<token>/",
        verify_email,
        name="verify_email",
    ),
    path(
        "verification-sent/",
        TemplateView.as_view(template_name="email_verification_sent.html"),
        name="email_verification_sent",
    ),
    path(
        "password-reset/",
        auth_views.PasswordResetView.as_view(
            template_name="registration/password_reset_form.html",
            email_template_name="registration/password_reset_email.txt",
            subject_template_name="registration/password_reset_subject.txt",
            success_url="/password-reset/done/",
        ),
        name="password_reset",
    ),
    path(
        "password-reset/done/",
        auth_views.PasswordResetDoneView.as_view(
            template_name="registration/password_reset_done.html"
        ),
        name="password_reset_done",
    ),
    path(
        "reset/<uidb64>/<token>/",
        auth_views.PasswordResetConfirmView.as_view(
            template_name="registration/password_reset_confirm.html",
            success_url="/reset/done/",
        ),
        name="password_reset_confirm",
    ),
    path(
        "reset/done/",
        auth_views.PasswordResetCompleteView.as_view(
            template_name="registration/password_reset_complete.html"
        ),
        name="password_reset_complete",
    ),
]
