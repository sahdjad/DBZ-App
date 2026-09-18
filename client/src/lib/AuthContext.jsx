import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api } from './api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const { user } = await api.get('/auth/me');
      setUser(user);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // Erst-Start: Marken-Splash mindestens ~3,5 s zeigen (wirkt hochwertiger),
  // auch wenn die Sitzungsprüfung schneller fertig ist. Spätere refresh()-Aufrufe
  // (z. B. Kontowechsel) sind davon nicht betroffen.
  useEffect(() => {
    const start = Date.now();
    (async () => {
      try {
        const { user } = await api.get('/auth/me');
        setUser(user);
      } catch {
        setUser(null);
      } finally {
        const wait = Math.max(0, 3500 - (Date.now() - start));
        setTimeout(() => setLoading(false), wait);
      }
    })();
  }, []);

  const login = async (email, password) => {
    const { user } = await api.post('/auth/login', { email, password });
    setUser(user);
    return user;
  };

  const register = async (payload) => {
    const { user } = await api.post('/auth/register', payload);
    setUser(user);
    return user;
  };

  // Offene Registrierung ohne Einladung/Klasse: Konto bleibt "pending", kein
  // automatischer Login (Server gibt bewusst keinen Token zurück).
  const registerOpen = async (payload) => {
    await api.post('/auth/register-open', payload);
  };

  const logout = async () => {
    await api.post('/auth/logout');
    setUser(null);
  };

  const updateName = async (name) => {
    const { user } = await api.patch('/me', { name });
    setUser(user);
    return user;
  };

  // Zu einem verknüpften Konto wechseln (neue Sitzung serverseitig).
  const switchAccount = async (id) => {
    const { user } = await api.post(`/me/switch/${id}`, {});
    setUser(user);
    return user;
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, registerOpen, logout, updateName, refresh, switchAccount }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth muss innerhalb von AuthProvider verwendet werden');
  return ctx;
}
