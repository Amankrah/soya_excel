import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { authAPI } from './api';

interface User {
  id: number;
  username: string;
  email?: string;
  first_name?: string;
  last_name?: string;
  role?: string;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  setUser: (user: User | null) => void;
  setToken: (token: string | null) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: true,

      checkAuth: async () => {
        set({ isLoading: true });

        try {
          const token = localStorage.getItem('authToken');

          if (!token) {
            set({
              user: null,
              token: null,
              isAuthenticated: false,
              isLoading: false
            });
            return;
          }

          // Verify token is still valid by fetching current user
          try {
            const user = await authAPI.getCurrentUser();
            set({
              user,
              token,
              isAuthenticated: true,
              isLoading: false,
            });
          } catch (error) {
            // Token is invalid, clear auth state
            console.error('Token validation failed:', error);
            localStorage.removeItem('authToken');
            localStorage.removeItem('user');
            set({
              user: null,
              token: null,
              isAuthenticated: false,
              isLoading: false,
            });
          }
        } catch (error) {
          console.error('Auth check failed:', error);
          set({ isLoading: false });
        }
      },

      login: async (username: string, password: string) => {
        try {
          const response = await authAPI.login(username, password);

          // Store token in localStorage (also handled by API interceptor)
          if (response.access || response.token) {
            const token = response.access || response.token;
            localStorage.setItem('authToken', token);

            // Get user details
            const user = response.user || await authAPI.getCurrentUser();

            set({
              user,
              token,
              isAuthenticated: true,
              isLoading: false,
            });
          }
        } catch (error) {
          console.error('Login failed:', error);
          throw error;
        }
      },

      logout: async () => {
        try {
          await authAPI.logout();
        } catch (error) {
          console.error('Logout error:', error);
        } finally {
          // Clear state regardless of API call success
          localStorage.removeItem('authToken');
          localStorage.removeItem('user');
          set({
            user: null,
            token: null,
            isAuthenticated: false,
            isLoading: false,
          });
        }
      },

      setUser: (user) => set({ user, isAuthenticated: !!user }),
      setToken: (token) => set({ token, isAuthenticated: !!token }),
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);
