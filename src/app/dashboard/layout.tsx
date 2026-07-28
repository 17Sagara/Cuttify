"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import { supabase } from "../../lib/supabase";
import Link from "next/link";
import { Toaster, toast } from "sonner";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [userEmail, setUserEmail] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Refs para control de montaje y para evitar múltiples redirecciones
  const mountedRef = useRef(true);
  const sessionResolvedRef = useRef(false);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Verificación de sesión con reintentos y timeout de seguridad
  useEffect(() => {
    let retryCount = 0;
    const maxRetries = 3;
    const retryDelay = 500;
    let retryTimeoutId: NodeJS.Timeout | null = null;

    const attempt = async () => {
      if (!mountedRef.current || sessionResolvedRef.current) return;

      try {
        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (sessionError) {
          console.warn("⚠️ Error en getSession:", sessionError.message);
        }

        if (session) {
          if (mountedRef.current) {
            setUserEmail(session.user?.email ?? "");
            sessionResolvedRef.current = true;
            setIsLoading(false);
          }
          return;
        }

        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError) {
          console.warn("⚠️ Error en getUser:", userError.message);
        }

        if (user) {
          if (mountedRef.current) {
            setUserEmail(user.email ?? "");
            sessionResolvedRef.current = true;
            setIsLoading(false);
          }
          return;
        }
      } catch (err) {
        console.error("❌ Error inesperado en verificación:", err);
      }

      retryCount++;
      if (retryCount < maxRetries && mountedRef.current) {
        retryTimeoutId = setTimeout(attempt, retryDelay);
      } else {
        if (mountedRef.current && !sessionResolvedRef.current) {
          sessionResolvedRef.current = true;
          toast.error("Tu sesión ha expirado o no es válida.");
          router.replace("/");
        }
      }
    };

    attempt();

    const safetyTimeout = setTimeout(() => {
      if (mountedRef.current && !sessionResolvedRef.current) {
        console.error("⏰ Timeout de verificación alcanzado.");
        sessionResolvedRef.current = true;
        toast.error("Tiempo de espera agotado al verificar sesión.");
        router.replace("/");
      }
    }, 8000);

    return () => {
      if (retryTimeoutId) clearTimeout(retryTimeoutId);
      clearTimeout(safetyTimeout);
    };
  }, [router]);

  const handleLogout = useCallback(async () => {
    try {
      await supabase.auth.signOut();
      toast.success("Sesión cerrada correctamente");
      router.replace("/");
    } catch (error) {
      console.error("Error al cerrar sesión:", error);
      toast.error("Ocurrió un error al cerrar sesión");
    }
  }, [router]);

  // Pantalla de carga
  if (isLoading) {
    return (
      <div className="h-screen w-screen bg-zinc-950 flex items-center justify-center text-white">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-zinc-400 text-sm">Verificando sesión…</p>
        </div>
      </div>
    );
  }

  const inicialUsuario = userEmail ? userEmail.charAt(0).toUpperCase() : "U";

  const closeMobileMenu = () => setMobileMenuOpen(false);

  return (
    <main className="flex h-screen bg-zinc-950 text-white print:bg-white print:text-black">
      {/* ------------ SIDEBAR ESCRITORIO (siempre visible >= lg) ------------ */}
      <aside className="hidden lg:flex w-64 border-r border-zinc-800 p-6 flex-col justify-between shrink-0 print:hidden">
        <div>
          <h2 className="text-2xl font-bold text-blue-500 mb-8">Cuttify</h2>
          <nav className="space-y-2">
            <Link
              href="/dashboard"
              className={`block py-2.5 px-4 rounded-lg text-sm font-medium transition-colors ${
                pathname === "/dashboard"
                  ? "bg-zinc-800 text-white font-semibold"
                  : "text-zinc-400 hover:text-white hover:bg-zinc-900"
              }`}
            >
              Optimizar Cortes
            </Link>
            <Link
              href="/dashboard/proyectos"
              className={`block py-2.5 px-4 rounded-lg text-sm font-medium transition-colors ${
                pathname === "/dashboard/proyectos"
                  ? "bg-zinc-800 text-white font-semibold"
                  : "text-zinc-400 hover:text-white hover:bg-zinc-900"
              }`}
            >
              Mis Proyectos
            </Link>
          </nav>
        </div>
      </aside>

      {/* ------------ PANEL PRINCIPAL ------------ */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header superior */}
        <header className="h-16 border-b border-zinc-800 flex items-center justify-between px-4 sm:px-8 bg-zinc-950/80 backdrop-blur-md sticky top-0 shrink-0 print:hidden z-10">
          <div className="flex items-center gap-3">
            {/* Botón hamburguesa visible solo en móviles */}
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 -ml-2 text-zinc-400 hover:text-white focus:outline-none"
              aria-label="Abrir menú"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <h1 className="text-lg font-semibold hidden sm:block">Panel de Control</h1>
          </div>
          <div className="flex items-center gap-3 sm:gap-6">
            {/* Email oculto en móviles muy pequeños, visible a partir de sm */}
            <span className="text-sm text-zinc-400 hidden sm:block">{userEmail}</span>
            <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-sm font-bold shadow-md">
              {inicialUsuario}
            </div>
            <button
              onClick={handleLogout}
              className="text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-3 py-2 sm:px-3.5 sm:py-2 rounded-lg transition-all border border-zinc-700 font-medium whitespace-nowrap"
            >
              Cerrar Sesión
            </button>
          </div>
        </header>

        {/* Vista de contenido */}
        <div className="flex-1 overflow-hidden">{children}</div>
      </div>

      {/* ------------ DRAWER MÓVIL (menú hamburguesa) ------------ */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          {/* Overlay oscuro */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={closeMobileMenu}
          />
          {/* Panel lateral deslizante */}
          <aside className="relative w-72 max-w-[85vw] bg-zinc-950 border-r border-zinc-800 p-6 h-full overflow-y-auto shadow-2xl animate-slide-in-left">
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-2xl font-bold text-blue-500">Cuttify</h2>
              <button
                onClick={closeMobileMenu}
                className="p-1 text-zinc-400 hover:text-white"
                aria-label="Cerrar menú"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <nav className="space-y-2">
              <Link
                href="/dashboard"
                onClick={closeMobileMenu}
                className={`block py-3 px-4 rounded-lg text-sm font-medium transition-colors ${
                  pathname === "/dashboard"
                    ? "bg-zinc-800 text-white font-semibold"
                    : "text-zinc-400 hover:text-white hover:bg-zinc-900"
                }`}
              >
                Optimizar Cortes
              </Link>
              <Link
                href="/dashboard/proyectos"
                onClick={closeMobileMenu}
                className={`block py-3 px-4 rounded-lg text-sm font-medium transition-colors ${
                  pathname === "/dashboard/proyectos"
                    ? "bg-zinc-800 text-white font-semibold"
                    : "text-zinc-400 hover:text-white hover:bg-zinc-900"
                }`}
              >
                Mis Proyectos
              </Link>
            </nav>
            {/* Separador opcional */}
            <div className="mt-8 pt-6 border-t border-zinc-800">
              <div className="flex items-center gap-3 text-sm text-zinc-400 mb-4">
                <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-xs font-bold">
                  {inicialUsuario}
                </div>
                <span className="truncate">{userEmail}</span>
              </div>
              <button
                onClick={() => {
                  closeMobileMenu();
                  handleLogout();
                }}
                className="w-full text-left bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-4 py-2.5 rounded-lg border border-zinc-700 font-medium text-sm"
              >
                Cerrar Sesión
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Toaster global */}
      <Toaster position="top-right" theme="dark" richColors closeButton />
    </main>
  );
}
