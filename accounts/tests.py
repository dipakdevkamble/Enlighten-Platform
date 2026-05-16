from django.contrib.auth import get_user_model
from django.contrib.auth.tokens import default_token_generator
from django.test import TestCase
from django.urls import reverse
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode


User = get_user_model()


class AuthFlowTests(TestCase):
    def test_signup_creates_inactive_user_and_redirects(self):
        response = self.client.post(
            reverse("signup"),
            data={
                "first_name": "Dipak",
                "last_name": "Kamble",
                "email": "dipak@example.com",
                "password1": "StrongPass123!",
                "password2": "StrongPass123!",
            },
        )

        self.assertRedirects(response, reverse("email_verification_sent"))
        user = User.objects.get(email="dipak@example.com")
        self.assertFalse(user.is_active)

    def test_email_verification_activates_user_and_allows_login(self):
        user = User.objects.create_user(
            username="verify@example.com",
            email="verify@example.com",
            password="StrongPass123!",
            is_active=False,
        )
        uid = urlsafe_base64_encode(force_bytes(user.pk))
        token = default_token_generator.make_token(user)

        verify_response = self.client.get(
            reverse("verify_email", kwargs={"uidb64": uid, "token": token})
        )
        self.assertRedirects(verify_response, reverse("login"))

        user.refresh_from_db()
        self.assertTrue(user.is_active)

        login_response = self.client.post(
            reverse("login"),
            data={"username": "verify@example.com", "password": "StrongPass123!"},
        )
        self.assertRedirects(login_response, reverse("home"))

# Create your tests here.
