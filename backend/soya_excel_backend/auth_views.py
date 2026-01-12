from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from django.contrib.auth import authenticate
from django.contrib.auth.models import User
from rest_framework_simplejwt.tokens import RefreshToken
from manager.models import Manager


class LoginView(APIView):
    """Custom login view that returns JWT tokens and user info"""
    permission_classes = [AllowAny]
    authentication_classes = []  # Disable authentication for login endpoint
    
    def post(self, request):
        username = request.data.get('username')
        password = request.data.get('password')

        if not username or not password:
            return Response(
                {'error': 'Please provide both username and password'},
                status=status.HTTP_400_BAD_REQUEST
            )

        user = authenticate(username=username, password=password)

        if not user:
            return Response(
                {'error': 'Invalid credentials'},
                status=status.HTTP_401_UNAUTHORIZED
            )

        # Check if user is a manager
        try:
            manager = Manager.objects.get(user=user)
            is_manager = True
            full_name = manager.full_name

            # Check if MFA is enabled
            if manager.mfa_enabled:
                return Response({
                    'mfa_required': True,
                    'username': user.username,
                    'message': 'Please provide your MFA code'
                }, status=status.HTTP_200_OK)

        except Manager.DoesNotExist:
            is_manager = False
            full_name = f"{user.first_name} {user.last_name}".strip() or user.username

        # Generate tokens (only if MFA not required)
        refresh = RefreshToken.for_user(user)

        return Response({
            'token': str(refresh.access_token),
            'refresh': str(refresh),
            'user': {
                'id': user.id,
                'username': user.username,
                'email': user.email,
                'full_name': full_name,
                'is_manager': is_manager,
                'mfa_enabled': False,
            }
        }, status=status.HTTP_200_OK)


# Keep the function-based view as well for backwards compatibility
login = LoginView.as_view()


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def logout(request):
    """Logout view (optional - frontend can just remove token)"""
    try:
        refresh_token = request.data.get('refresh')
        if refresh_token:
            token = RefreshToken(refresh_token)
            token.blacklist()
        return Response({'message': 'Logout successful'}, status=status.HTTP_200_OK)
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_current_user(request):
    """Get current authenticated user info"""
    user = request.user

    try:
        manager = Manager.objects.get(user=user)
        is_manager = True
        full_name = manager.full_name
        mfa_enabled = manager.mfa_enabled if hasattr(manager, 'mfa_enabled') else False
    except Manager.DoesNotExist:
        is_manager = False
        full_name = f"{user.first_name} {user.last_name}".strip() or user.username
        mfa_enabled = False

    return Response({
        'id': user.id,
        'username': user.username,
        'email': user.email,
        'full_name': full_name,
        'is_manager': is_manager,
        'mfa_enabled': mfa_enabled,
    }, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def change_password(request):
    """Change user password"""
    user = request.user
    old_password = request.data.get('old_password')
    new_password = request.data.get('new_password')
    confirm_password = request.data.get('confirm_password')

    if not old_password or not new_password or not confirm_password:
        return Response(
            {'error': 'Please provide old_password, new_password, and confirm_password'},
            status=status.HTTP_400_BAD_REQUEST
        )

    # Verify old password
    if not user.check_password(old_password):
        return Response(
            {'error': 'Current password is incorrect'},
            status=status.HTTP_400_BAD_REQUEST
        )

    # Verify new passwords match
    if new_password != confirm_password:
        return Response(
            {'error': 'New passwords do not match'},
            status=status.HTTP_400_BAD_REQUEST
        )

    # Validate password strength
    if len(new_password) < 8:
        return Response(
            {'error': 'Password must be at least 8 characters long'},
            status=status.HTTP_400_BAD_REQUEST
        )

    # Change password
    user.set_password(new_password)
    user.save()

    return Response({
        'message': 'Password changed successfully'
    }, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def setup_mfa(request):
    """Setup MFA for the current user"""
    import pyotp
    import qrcode
    from io import BytesIO
    import base64

    user = request.user

    try:
        manager = Manager.objects.get(user=user)
    except Manager.DoesNotExist:
        return Response(
            {'error': 'Only managers can enable MFA'},
            status=status.HTTP_403_FORBIDDEN
        )

    # Generate a secret key if not already set
    if not manager.mfa_secret:
        manager.mfa_secret = pyotp.random_base32()
        manager.save()

    # Generate TOTP URI for QR code
    totp_uri = pyotp.totp.TOTP(manager.mfa_secret).provisioning_uri(
        name=user.email,
        issuer_name='SoyaFlow'
    )

    # Generate QR code
    qr = qrcode.QRCode(version=1, box_size=10, border=5)
    qr.add_data(totp_uri)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")

    # Convert to base64
    buffered = BytesIO()
    img.save(buffered, format="PNG")
    img_str = base64.b64encode(buffered.getvalue()).decode()

    return Response({
        'secret': manager.mfa_secret,
        'qr_code': f'data:image/png;base64,{img_str}',
        'totp_uri': totp_uri
    }, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def verify_mfa_setup(request):
    """Verify and enable MFA with a TOTP code"""
    import pyotp

    user = request.user
    code = request.data.get('code')

    if not code:
        return Response(
            {'error': 'Please provide MFA code'},
            status=status.HTTP_400_BAD_REQUEST
        )

    try:
        manager = Manager.objects.get(user=user)
    except Manager.DoesNotExist:
        return Response(
            {'error': 'Only managers can enable MFA'},
            status=status.HTTP_403_FORBIDDEN
        )

    if not manager.mfa_secret:
        return Response(
            {'error': 'Please setup MFA first'},
            status=status.HTTP_400_BAD_REQUEST
        )

    # Verify TOTP code
    totp = pyotp.TOTP(manager.mfa_secret)
    if totp.verify(code, valid_window=1):
        manager.mfa_enabled = True
        manager.save()

        return Response({
            'message': 'MFA enabled successfully'
        }, status=status.HTTP_200_OK)
    else:
        return Response(
            {'error': 'Invalid MFA code'},
            status=status.HTTP_400_BAD_REQUEST
        )


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def disable_mfa(request):
    """Disable MFA for the current user"""
    user = request.user
    password = request.data.get('password')

    if not password:
        return Response(
            {'error': 'Please provide your password to disable MFA'},
            status=status.HTTP_400_BAD_REQUEST
        )

    # Verify password
    if not user.check_password(password):
        return Response(
            {'error': 'Incorrect password'},
            status=status.HTTP_400_BAD_REQUEST
        )

    try:
        manager = Manager.objects.get(user=user)
        manager.mfa_enabled = False
        manager.mfa_secret = ''
        manager.save()

        return Response({
            'message': 'MFA disabled successfully'
        }, status=status.HTTP_200_OK)
    except Manager.DoesNotExist:
        return Response(
            {'error': 'Manager profile not found'},
            status=status.HTTP_404_NOT_FOUND
        )


@api_view(['POST'])
@permission_classes([AllowAny])
def verify_mfa_login(request):
    """Verify MFA code during login"""
    import pyotp

    username = request.data.get('username')
    code = request.data.get('code')

    if not username or not code:
        return Response(
            {'error': 'Please provide username and MFA code'},
            status=status.HTTP_400_BAD_REQUEST
        )

    try:
        user = User.objects.get(username=username)
        manager = Manager.objects.get(user=user)

        if not manager.mfa_enabled:
            return Response(
                {'error': 'MFA is not enabled for this account'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Verify TOTP code
        totp = pyotp.TOTP(manager.mfa_secret)
        if totp.verify(code, valid_window=1):
            # Generate tokens
            refresh = RefreshToken.for_user(user)

            return Response({
                'token': str(refresh.access_token),
                'refresh': str(refresh),
                'user': {
                    'id': user.id,
                    'username': user.username,
                    'email': user.email,
                    'full_name': manager.full_name,
                    'is_manager': True,
                    'mfa_enabled': True,
                }
            }, status=status.HTTP_200_OK)
        else:
            return Response(
                {'error': 'Invalid MFA code'},
                status=status.HTTP_401_UNAUTHORIZED
            )
    except (User.DoesNotExist, Manager.DoesNotExist):
        return Response(
            {'error': 'User not found'},
            status=status.HTTP_404_NOT_FOUND
        ) 