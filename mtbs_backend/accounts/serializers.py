from rest_framework import serializers
from .models import CustomUser
from django.contrib.auth.password_validation import validate_password
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

class UserSerializer(serializers.ModelSerializer):
    # Read-only mirror of the wallet balance, so the frontend can show the
    # chip and gate "pay with wallet" straight from the profile call without a
    # second request. Never writable — the balance is only ever moved by
    # wallet.services.apply_delta under a row lock.
    wallet_balance = serializers.SerializerMethodField()

    class Meta:
        model = CustomUser
        fields = ('id', 'username', 'email', 'role', 'wallet_balance')

    def get_wallet_balance(self, obj):
        # Lazy import: accounts must not import wallet at module load, and a
        # missing wallet row (user who's never transacted) simply reads as 0.
        from wallet.models import Wallet
        wallet = Wallet.objects.filter(user=obj).only('balance').first()
        return str(wallet.balance) if wallet else '0.00'

class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, required=True, validators=[validate_password])
    password2 = serializers.CharField(write_only=True, required=True)
    email = serializers.EmailField(required=True)
    # Read-only on purpose. This endpoint is open to the public, so a writable
    # `role` would let anyone POST {"role": "ADMIN"} and hand themselves the
    # admin API — every IsAdmin check downstream would then pass legitimately.
    # Admins are created deliberately, via `createsuperuser` or Django admin.
    role = serializers.CharField(read_only=True)

    class Meta:
        model = CustomUser
        fields = ('username', 'email', 'password', 'password2', 'role')

    def validate_email(self, value):
        # Case-insensitive: two accounts differing only in case invite
        # confusion over which one a password reset would reach.
        if CustomUser.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError('An account with this email already exists.')
        return value

    def validate(self, attrs):
        if attrs['password'] != attrs['password2']:
            raise serializers.ValidationError({"password": "Passwords do not match."})
        return attrs

    def create(self, validated_data):
        validated_data.pop('password2')
        # Belt and braces: even if `role` becomes writable again by accident,
        # self-registration can only ever mint a regular user.
        validated_data['role'] = CustomUser.ROLE_USER
        user = CustomUser.objects.create_user(**validated_data)
        return user

# ✅ Custom JWT Serializer
class MyTokenObtainPairSerializer(TokenObtainPairSerializer):
    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token['username'] = user.username
        token['role'] = user.role
        return token
