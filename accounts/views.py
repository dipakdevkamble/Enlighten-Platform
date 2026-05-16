from django.contrib import messages
from django.contrib.auth import get_user_model
from django.contrib.auth.tokens import default_token_generator
from django.contrib.sites.shortcuts import get_current_site
from django.shortcuts import get_object_or_404, redirect, render
from django.template.loader import render_to_string
from django.urls import reverse
from django.utils.encoding import force_bytes, force_str
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode

from .forms import SignupForm

User = get_user_model()


def home(request):
    if request.user.is_authenticated:
        return render(request, "home.html")
    return redirect("login")


def signup_view(request):
    if request.user.is_authenticated:
        return redirect("home")

    form = SignupForm(request.POST or None)
    if request.method == "POST" and form.is_valid():
        user = form.save()
        send_verification_email(request, user)
        messages.success(
            request,
            "Account created successfully. Please check your email and verify your account before login.",
        )
        return redirect("email_verification_sent")

    return render(request, "signup1.html", {"form": form})


def send_verification_email(request, user):
    uid = urlsafe_base64_encode(force_bytes(user.pk))
    token = default_token_generator.make_token(user)
    verification_url = request.build_absolute_uri(
        reverse("verify_email", kwargs={"uidb64": uid, "token": token})
    )
    context = {
        "user": user,
        "verification_url": verification_url,
        "site_name": get_current_site(request).name,
    }
    subject = "Verify your Enlighten account"
    message = render_to_string("emails/verification_email.txt", context)
    html_message = render_to_string("emails/verification_email.html", context)
    user.email_user(subject, message, html_message=html_message)


def verify_email(request, uidb64, token):
    try:
        uid = force_str(urlsafe_base64_decode(uidb64))
        user = get_object_or_404(User, pk=uid)
    except (TypeError, ValueError, OverflowError):
        user = None

    if user and default_token_generator.check_token(user, token):
        user.is_active = True
        user.save(update_fields=["is_active"])
        messages.success(request, "Your email has been verified. You can now log in.")
        return redirect("login")

    messages.error(request, "Email verification link is invalid or has expired.")
    return redirect("signup")
