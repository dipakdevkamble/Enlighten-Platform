from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase


class AuthTests(APITestCase):
    def test_register_and_me(self):
        register_payload = {
            "email": "test@example.com",
            "password": "StrongPass123!",
            "first_name": "Test",
            "last_name": "User",
        }
        response = self.client.post(reverse("auth-register"), register_payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn("access", response.data)
        self.assertIn("refresh", response.data)

        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {response.data['access']}")
        me_response = self.client.get(reverse("auth-me"))
        self.assertEqual(me_response.status_code, status.HTTP_200_OK)
        self.assertEqual(me_response.data["email"], register_payload["email"])

    def test_login(self):
        self.client.post(
            reverse("auth-register"),
            {
                "email": "login@example.com",
                "password": "StrongPass123!",
                "first_name": "Login",
                "last_name": "User",
            },
            format="json",
        )

        login_response = self.client.post(
            reverse("auth-login"),
            {"email": "login@example.com", "password": "StrongPass123!"},
            format="json",
        )
        self.assertEqual(login_response.status_code, status.HTTP_200_OK)
        self.assertIn("access", login_response.data)
        self.assertIn("refresh", login_response.data)
