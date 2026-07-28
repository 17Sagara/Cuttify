"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

// -----------------------------------------------------------------------------
// Interfaces
// -----------------------------------------------------------------------------
interface Proyecto {
  id: string;
  title: string;
  created_at: string;
  sheet_width?: number;
  sheet_height?: number;
  kerf?: number;
  allow_rotation?: boolean;
}

// -----------------------------------------------------------------------------
// Componente
// -----------------------------------------------------------------------------
export default function MisProyectos() {
  const [proyectos, setProyectos] = useState<Proyecto[]>([]);
  const [cargando, setCargando] = useState(true);
  const [eliminandoId, setEliminandoId] = useState<string | null>(null);
  const [creandoProyecto, setCreandoProyecto] = useState(false);

  // Estados para la edición inline del nombre
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [nuevoTitulo, setNuevoTitulo] = useState("");
  const [guardandoTitulo, setGuardandoTitulo] = useState(false);

  const router = useRouter();
  const mountedRef = useRef(true);
  const abortControllerRef = useRef<AbortController | null>(null);

  // -------------------------------------------------------------------------
  // Carga inicial de proyectos
  // -------------------------------------------------------------------------
  const cargarProyectos = useCallback(async () => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();

    try {
      setCargando(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Debes iniciar sesión para ver tus proyectos.");
        router.push("/");
        return;
      }

      const { data, error } = await supabase
        .from("projects")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .abortSignal(abortControllerRef.current.signal);

      if (error) throw error;

      if (data && mountedRef.current) {
        const uniqueMap = new Map<string, Proyecto>();
        data.forEach((proj) => {
          if (!uniqueMap.has(proj.id)) {
            uniqueMap.set(proj.id, proj);
          }
        });
        setProyectos(Array.from(uniqueMap.values()));
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") return;

      console.error("Error al cargar proyectos:", err);

      if (mountedRef.current) {
        toast.error("No pudimos cargar tus proyectos. Intenta de nuevo.");
      }
    } finally {
      if (mountedRef.current) {
        setCargando(false);
      }
    }
  }, [router]);

  useEffect(() => {
    mountedRef.current = true;
    cargarProyectos();

    return () => {
      mountedRef.current = false;
      abortControllerRef.current?.abort();
    };
  }, [cargarProyectos]);

  // -------------------------------------------------------------------------
  // Crear proyecto nuevo
  // -------------------------------------------------------------------------
  const handleNuevoProyecto = async () => {
    const nombreProyecto = window.prompt(
      "Asigná un nombre a tu nuevo proyecto:",
      "Proyecto de corte"
    );

    if (nombreProyecto === null) {
      toast.info("Creación cancelada");
      return;
    }

    const tituloFinal =
      nombreProyecto.trim() !== "" ? nombreProyecto.trim() : "Proyecto sin título";

    try {
      setCreandoProyecto(true);

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError || !user) {
        toast.error("Debes iniciar sesión para crear un proyecto.");
        return;
      }

      const { data: nuevoProyecto, error } = await supabase
        .from("projects")
        .insert([
          {
            user_id: user.id,
            title: tituloFinal,
            board_width: 2440,
            board_height: 1220,
            kerf: 0,
            margin: 0,
            allow_rotation: true,
          },
        ])
        .select()
        .single();

      if (error) throw error;

      toast.success(`Proyecto "${tituloFinal}" creado.`);
      router.push(`/dashboard?proyecto=${nuevoProyecto.id}`);
    } catch (err: any) {
      console.error("Error al crear proyecto:", err);
      toast.error(err.message || "No se pudo crear el proyecto.");
    } finally {
      if (mountedRef.current) {
        setCreandoProyecto(false);
      }
    }
  };

  // -------------------------------------------------------------------------
  // Eliminar proyecto
  // -------------------------------------------------------------------------
  const eliminarProyecto = async (proyectoId: string) => {
    const confirmar = window.confirm(
      "¿Estás seguro de que quieres eliminar este proyecto? Esta acción no se puede deshacer."
    );
    if (!confirmar) return;

    setEliminandoId(proyectoId);

    try {
      const { data: proyectoExistente, error: checkError } = await supabase
        .from("projects")
        .select("id")
        .eq("id", proyectoId)
        .single();

      if (checkError && checkError.code !== "PGRST116") {
        throw new Error("No se pudo verificar el proyecto.");
      }

      if (!proyectoExistente) {
        setProyectos((prev) => prev.filter((p) => p.id !== proyectoId));
        toast.info("El proyecto ya había sido eliminado.");
        return;
      }

      const { error } = await supabase
        .from("projects")
        .delete()
        .eq("id", proyectoId);

      if (error) throw error;

      setProyectos((prev) => prev.filter((p) => p.id !== proyectoId));
      toast.success("Proyecto eliminado con éxito.");
    } catch (error: unknown) {
      console.error("Error al eliminar proyecto:", error);
      toast.error("No se pudo eliminar el proyecto. Intenta de nuevo.");
    } finally {
      if (mountedRef.current) {
        setEliminandoId(null);
      }
    }
  };

  // -------------------------------------------------------------------------
  // Funciones para editar el título
  // -------------------------------------------------------------------------
  const iniciarEdicion = (proyecto: Proyecto) => {
    setEditandoId(proyecto.id);
    setNuevoTitulo(proyecto.title || "");
  };

  const cancelarEdicion = () => {
    setEditandoId(null);
    setNuevoTitulo("");
  };

  const guardarEdicion = async (proyectoId: string) => {
    const tituloLimpio = nuevoTitulo.trim();
    if (!tituloLimpio) {
      toast.error("El nombre no puede estar vacío.");
      return;
    }

    setGuardandoTitulo(true);
    try {
      const { error } = await supabase
        .from("projects")
        .update({ title: tituloLimpio })
        .eq("id", proyectoId);

      if (error) throw error;

      setProyectos((prev) =>
        prev.map((p) =>
          p.id === proyectoId ? { ...p, title: tituloLimpio } : p
        )
      );
      toast.success("Nombre actualizado.");
      cancelarEdicion();
    } catch (err: any) {
      console.error("Error al actualizar título:", err);
      toast.error(err.message || "No se pudo actualizar el nombre.");
    } finally {
      if (mountedRef.current) {
        setGuardandoTitulo(false);
      }
    }
  };

  // -------------------------------------------------------------------------
  // Abrir proyecto en el dashboard
  // -------------------------------------------------------------------------
  const abrirProyecto = (proyectoId: string) => {
    router.push(`/dashboard?proyecto=${proyectoId}`);
  };

  // -------------------------------------------------------------------------
  // Utilidades
  // -------------------------------------------------------------------------
  const formatearFecha = (fecha: string) =>
    new Date(fecha).toLocaleDateString("es-ES", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <div className="p-4 md:p-8 overflow-y-auto h-[calc(100vh-4rem)] w-full bg-zinc-950 text-zinc-100">
      {/* Encabezado sticky en móvil */}
      <div className="sticky top-0 z-10 bg-zinc-950/90 backdrop-blur-sm -mx-4 md:-mx-8 px-4 md:px-8 pb-4 pt-4 md:pt-0 md:pb-0 mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-xl md:text-3xl font-bold text-white tracking-tight">
            Tus proyectos guardados
          </h1>
          <p className="text-sm text-zinc-400 mt-1 hidden sm:block">
            Gestiona, elimina o retoma tus listas de optimización de cortes anteriores.
          </p>
        </div>

        <button
          onClick={handleNuevoProyecto}
          disabled={creandoProyecto}
          className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-3 sm:px-4 sm:py-2.5 rounded-lg text-sm font-medium transition-all shadow-md shadow-blue-900/20 flex items-center gap-2 w-full sm:w-auto justify-center disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {creandoProyecto ? (
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <span className="text-lg leading-none">+</span>
          )}
          {creandoProyecto ? "Creando…" : "Nuevo Proyecto"}
        </button>
      </div>

      {/* Estado de carga */}
      {cargando ? (
        <div className="flex h-64 items-center justify-center text-zinc-500 text-sm">
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-zinc-400">Cargando tus proyectos...</p>
          </div>
        </div>
      ) : proyectos.length === 0 ? (
        /* Estado vacío */
        <div className="text-center py-16 px-4 bg-zinc-900/30 rounded-2xl border border-dashed border-zinc-800">
          <div className="w-16 h-16 bg-zinc-800/50 rounded-full flex items-center justify-center mx-auto mb-4 text-zinc-500">
            <svg
              className="w-8 h-8"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
              />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-white mb-1">
            No hay proyectos creados
          </h3>
          <p className="text-zinc-400 text-sm mb-6 max-w-sm mx-auto">
            Aún no has guardado ningún plan de corte. Empezá uno nuevo para optimizar tus materiales.
          </p>
          <button
            onClick={handleNuevoProyecto}
            disabled={creandoProyecto}
            className="inline-flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-white px-5 py-3 sm:px-4 sm:py-2 rounded-lg text-sm font-medium border border-zinc-700 transition disabled:opacity-50"
          >
            {creandoProyecto ? "Creando..." : "Crear mi primer proyecto"}
          </button>
        </div>
      ) : (
        /* Grid de tarjetas */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
          {proyectos.map((proyecto) => (
            <div
              key={proyecto.id}
              className="bg-zinc-900/80 border border-zinc-800/80 hover:border-zinc-700 p-4 sm:p-5 rounded-xl shadow-md transition-all flex flex-col justify-between group"
            >
              <div>
                {/* Título editable */}
                <div className="flex justify-between items-start gap-2 mb-2">
                  {editandoId === proyecto.id ? (
                    <div className="flex-1 flex flex-col gap-3">
                      <input
                        type="text"
                        value={nuevoTitulo}
                        onChange={(e) => setNuevoTitulo(e.target.value)}
                        className="w-full bg-zinc-800 text-white text-sm rounded-lg px-3 py-2.5 border border-zinc-700 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                        autoFocus
                        disabled={guardandoTitulo}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") guardarEdicion(proyecto.id);
                          if (e.key === "Escape") cancelarEdicion();
                        }}
                      />
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={() => guardarEdicion(proyecto.id)}
                          disabled={guardandoTitulo}
                          className="bg-blue-600 hover:bg-blue-500 text-white text-xs px-4 py-2 rounded-lg transition-colors flex items-center gap-1 disabled:opacity-50"
                        >
                          {guardandoTitulo ? (
                            <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                          )}
                          Guardar
                        </button>
                        <button
                          onClick={cancelarEdicion}
                          disabled={guardandoTitulo}
                          className="bg-zinc-800 text-zinc-300 hover:bg-zinc-700 text-xs px-4 py-2 rounded-lg transition-colors"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <h3
                        className="text-base font-semibold text-white truncate group-hover:text-blue-400 transition-colors flex-1"
                        title={proyecto.title || "Proyecto sin nombre"}
                      >
                        {proyecto.title || "Proyecto sin nombre"}
                      </h3>
                      <button
                        onClick={() => iniciarEdicion(proyecto)}
                        className="text-zinc-500 hover:text-zinc-300 p-1.5 rounded-md transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                        title="Editar nombre"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                      </button>
                    </>
                  )}
                </div>

                <p className="text-xs text-zinc-500 mb-4">
                  Guardado el: {formatearFecha(proyecto.created_at)}
                </p>

                {/* Información adicional si existe */}
                {(proyecto.sheet_width || proyecto.sheet_height) && (
                  <div className="bg-zinc-950/60 rounded-lg p-3 border border-zinc-800/50 mb-4 text-xs text-zinc-400 space-y-1">
                    <div className="flex justify-between gap-2">
                      <span className="whitespace-nowrap">Lámina base:</span>
                      <span className="font-mono text-zinc-200 text-right">
                        {proyecto.sheet_width || 0} x {proyecto.sheet_height || 0} mm
                      </span>
                    </div>
                    {proyecto.kerf !== undefined && (
                      <div className="flex justify-between gap-2">
                        <span className="whitespace-nowrap">Kerf:</span>
                        <span className="font-mono text-zinc-200 text-right">
                          {proyecto.kerf} mm
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Botones de acción */}
              <div className="flex gap-3 pt-3 border-t border-zinc-800/60 mt-2">
                <button
                  onClick={() => abrirProyecto(proyecto.id)}
                  className="flex-1 bg-blue-600/10 hover:bg-blue-600 text-blue-400 hover:text-white py-3 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors border border-blue-500/20 hover:border-blue-600 text-center"
                >
                  Abrir Proyecto
                </button>
                <button
                  onClick={() => eliminarProyecto(proyecto.id)}
                  disabled={eliminandoId === proyecto.id}
                  className="p-3 sm:p-2 bg-zinc-800/80 text-zinc-400 hover:bg-red-500/10 hover:text-red-400 border border-zinc-700/50 hover:border-red-500/30 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  title={
                    eliminandoId === proyecto.id
                      ? "Eliminando..."
                      : "Eliminar proyecto"
                  }
                >
                  {eliminandoId === proyecto.id ? (
                    <div className="w-5 h-5 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                      />
                    </svg>
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
