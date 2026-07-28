"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabase";

export default function Home() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const [isRecovering, setIsRecovering] = useState(false);
  const [recoverEmail, setRecoverEmail] = useState("");
  const [recoverMessage, setRecoverMessage] = useState<string | null>(null);

  // 🚫 Desactivado temporalmente: evitamos que el efecto automático interfiera
  // useEffect(() => {
  //   const checkSession = async () => {
  //     const { data } = await supabase.auth.getSession();
  //     if (data.session) {
  //       router.replace("/dashboard");
  //     }
  //   };
  //   checkSession();
  // }, [router]);

  const isValidEmail = (email: string) => /\S+@\S+\.\S+/.test(email);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!isValidEmail(email)) {
      setError("Ingrese un correo electrónico válido");
      return;
    }
    if (password.length < 6) {
      setError("La contraseña debe tener al menos 6 caracteres");
      return;
    }

    setIsLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      if (error.message.includes("Invalid login")) {
        setError("Correo o contraseña incorrectos");
      } else {
        setError("Ocurrió un error al iniciar sesión");
      }
      setIsLoading(false);
    } else {
      // ⚡ Forzamos recarga completa para evitar conflictos con el estado del router
      window.location.href = "/dashboard";
    }
  };

  const handleRecoverPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setRecoverMessage(null);

    if (!isValidEmail(recoverEmail)) {
      setRecoverMessage("Ingrese un correo válido");
      return;
    }

    const redirectTo = `${window.location.origin}/auth/update-password`;

    const { error } = await supabase.auth.resetPasswordForEmail(recoverEmail, {
      redirectTo,
    });

    if (error) {
      setRecoverMessage("Error al enviar el enlace. Intente nuevamente.");
    } else {
      setRecoverMessage(
        "Te hemos enviado un enlace para restablecer tu contraseña. Revisa tu correo."
      );
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 text-white p-4">
      <div className="text-center mb-10">
        <h1 className="text-6xl font-extrabold text-blue-500 tracking-tight">
          Cuttify
        </h1>
        <p className="mt-4 text-xl text-zinc-400">
          Motor de optimización de cortes iniciado...
        </p>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 p-8 rounded-2xl shadow-2xl w-full max-w-md">
        {!isRecovering ? (
          <form onSubmit={handleLogin} className="flex flex-col gap-6">
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-2">
                Correo Electrónico
              </label>
              <input
                type="email"
                placeholder="admin@cuttify.com"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setError(null);
                }}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white placeholder:text-zinc-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-2">
                Contraseña
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setError(null);
                  }}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white placeholder:text-zinc-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                  tabIndex={-1}
                  aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                >
                  {showPassword ? (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-5 w-5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13.875 18.825A10.05 10.05 0 0112 19c-5 0-9.27-3.11-11-7.5 1.73-4.39 6-7.5 11-7.5s9.27 3.11 11 7.5a10.05 10.05 0 01-1.875 2.825M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M3 3l18 18"
                      />
                    </svg>
                  ) : (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-5 w-5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                      />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <div className="text-right">
              <button
                type="button"
                onClick={() => {
                  setIsRecovering(true);
                  setRecoverEmail(email);
                  setError(null);
                }}
                className="text-sm text-blue-500 hover:text-blue-400 transition-colors"
              >
                ¿Olvidaste tu contraseña?
              </button>
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/50 text-red-500 text-sm p-3 rounded-lg text-center">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed text-white font-bold py-3.5 rounded-xl transition-all shadow-lg shadow-blue-900/20 flex items-center justify-center"
            >
              {isLoading ? (
                <svg
                  className="animate-spin h-5 w-5 mr-2"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
              ) : null}
              {isLoading ? "Validando..." : "Ingresar al Sistema"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleRecoverPassword} className="flex flex-col gap-6">
            <h2 className="text-2xl font-bold text-center mb-2">
              Recuperar Contraseña
            </h2>
            <p className="text-sm text-zinc-400 text-center -mt-2">
              Ingresa tu correo para recibir un enlace de restablecimiento.
            </p>

            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-2">
                Correo Electrónico
              </label>
              <input
                type="email"
                placeholder="tu@email.com"
                value={recoverEmail}
                onChange={(e) => setRecoverEmail(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white placeholder:text-zinc-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                required
              />
            </div>

            {recoverMessage && (
              <div
                className={`text-sm p-3 rounded-lg text-center ${
                  recoverMessage.includes("enviado")
                    ? "bg-blue-500/10 border border-blue-500/50 text-blue-400"
                    : "bg-red-500/10 border border-red-500/50 text-red-500"
                }`}
              >
                {recoverMessage}
              </div>
            )}

            <button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 rounded-xl transition-all shadow-lg shadow-blue-900/20"
            >
              Enviar Enlace
            </button>

            <button
              type="button"
              onClick={() => setIsRecovering(false)}
              className="text-sm text-zinc-400 hover:text-zinc-300 transition-colors text-center"
            >
              ← Volver al inicio de sesión
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
