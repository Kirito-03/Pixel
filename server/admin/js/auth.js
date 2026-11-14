// Authentication handling for admin panel

const API_BASE = window.location.origin;

// Check if user is already authenticated
async function checkAuth() {
    try {
        const response = await fetch(`${API_BASE}/auth/admin/check`, {
            credentials: 'include'
        });
        const data = await response.json();

        if (data.authenticated) {
            // Redirect to dashboard if already logged in
            window.location.href = '/admin/dashboard.html';
        }
    } catch (error) {
        console.error('Error checking auth:', error);
    }
}

// Handle Google login
function handleGoogleLogin() {
    // Redirect to Google OAuth endpoint
    window.location.href = `${API_BASE}/auth/google`;
}

// Show error message
function showError(message) {
    const errorDiv = document.getElementById('error-message');
    if (errorDiv) {
        errorDiv.textContent = message;
        errorDiv.style.display = 'block';
    }
}

// Check for error in URL params
function checkForErrors() {
    const urlParams = new URLSearchParams(window.location.search);
    const error = urlParams.get('error');

    if (error) {
        let errorMessage = 'Error al iniciar sesión';

        switch (error) {
            case 'auth_failed':
                errorMessage = 'Autenticación fallida. Por favor, intenta de nuevo.';
                break;
            case 'token_generation_failed':
                errorMessage = 'Error al generar token de sesión.';
                break;
            case 'unauthorized':
                errorMessage = 'Tu email no está autorizado para acceder al panel de administración.';
                break;
            default:
                errorMessage = 'Error desconocido. Por favor, contacta al administrador.';
        }

        showError(errorMessage);
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    checkForErrors();

    const loginBtn = document.getElementById('google-login-btn');
    if (loginBtn) {
        loginBtn.addEventListener('click', handleGoogleLogin);
    }
});
