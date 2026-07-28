"use client";
import { useState, useEffect, useCallback, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "../../lib/supabase";
import { toPng } from "html-to-image";
import jsPDF from "jspdf";
import { optimizarCorteMultiLamina } from "../../lib/packing";
import CorteVisualizer from "../../components/CorteVisualizer";
import ResumenRendimiento from "../../components/ResumenRendimiento";
import { toast } from "sonner";

// -----------------------------------------------------------------------------
// Tipos y helpers
// -----------------------------------------------------------------------------
const generateId = () => {
  if (typeof crypto?.randomUUID === "function") return crypto.randomUUID();
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) => {
    const num = Number(c);
    return (
      num ^
      (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (num / 4)))
    ).toString(16);
  });
};

type PiezaFormulario = {
  id: string;
  piece_name: string;
  width: number | "";
  height: number | "";
  quantity: number | "";
};

interface PanelConfiguracionProps {
  ancho: string;
  setAncho: (val: string) => void;
  alto: string;
  setAlto: (val: string) => void;
  kerf: string;
  setKerf: (val: string) => void;
  margen: string;
  setMargen: (val: string) => void;
  rotacion: boolean;
  setRotacion: (val: boolean) => void;
  piezas: PiezaFormulario[];
  agregarPieza: () => void;
  actualizarPieza: (id: string, campo: keyof PiezaFormulario, valor: string | number) => void;
  eliminarPieza: (id: string) => void;
  guardarProyectoCompleto: () => void;
  guardandoProyecto: boolean;
  onResultadoReset: () => void;
  dentroDeDrawer?: boolean;
}

const DEFAULT_BOARD_WIDTH = 2440;
const DEFAULT_BOARD_HEIGHT = 1220;
const DEFAULT_PROJECT_TITLE = "Proyecto sin título";

// -----------------------------------------------------------------------------
// Componente principal
// -----------------------------------------------------------------------------
function DashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const proyectoIdEnUrl = searchParams?.get("proyecto") ?? null;
  const mountedRef = useRef(true);
  const loadTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Estados centrales
  const [user, setUser] = useState<{ id: string; email: string } | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [projectTitle, setProjectTitle] = useState(DEFAULT_PROJECT_TITLE);
  const [ancho, setAncho] = useState(DEFAULT_BOARD_WIDTH.toString());
  const [alto, setAlto] = useState(DEFAULT_BOARD_HEIGHT.toString());
  const [kerf, setKerf] = useState("0");
  const [margen, setMargen] = useState("0");
  const [rotacion, setRotacion] = useState(true);
  const [piezas, setPiezas] = useState<PiezaFormulario[]>([]);
  const [resultadoCorte, setResultadoCorte] = useState<any>(null);
  const [cargandoDatos, setCargandoDatos] = useState(true);
  const [errorInicial, setErrorInicial] = useState<string | null>(null);
  const [guardandoTitulo, setGuardandoTitulo] = useState(false);
  const [guardandoProyecto, setGuardandoProyecto] = useState(false);
  const [generandoPDF, setGenerandoPDF] = useState(false);
  const [calculando, setCalculando] = useState(false);
  const [menuMobileAbierto, setMenuMobileAbierto] = useState(false);
  const planoRef = useRef<HTMLDivElement>(null);

  // Redirigir si no hay sesión después de intentar cargar
  useEffect(() => {
    if (!cargandoDatos && !user && !errorInicial) {
      const redirectTimer = setTimeout(() => router.replace("/"), 2000);
      return () => clearTimeout(redirectTimer);
    }
  }, [cargandoDatos, user, errorInicial, router]);

  // ---------------------------------------------------------------------------
  // Carga inicial de datos
  // ---------------------------------------------------------------------------
  const fetchInitialData = useCallback(async () => {
    if (!mountedRef.current) return;
    setCargandoDatos(true);
    setErrorInicial(null);
    loadTimeoutRef.current = setTimeout(() => {
      if (mountedRef.current) {
        setErrorInicial("La carga tardó demasiado. Verifica tu conexión.");
        setCargandoDatos(false);
      }
    }, 8000);

    try {
      const {
        data: { user: authUser },
        error: userError,
      } = await supabase.auth.getUser();
      if (!mountedRef.current || userError || !authUser) {
        setErrorInicial("No se pudo verificar tu sesión. Intenta recargar.");
        setCargandoDatos(false);
        return;
      }
      setUser({ id: authUser.id, email: authUser.email ?? "Usuario" });

      let targetProjectId = proyectoIdEnUrl;
      if (!targetProjectId) {
        const { data: lastProject } = await supabase
          .from("projects")
          .select("id")
          .eq("user_id", authUser.id)
          .order("created_at", { ascending: false })
          .limit(1);
        if (lastProject?.length) targetProjectId = lastProject[0].id;
      }

      if (!targetProjectId) {
        // Sin proyecto: limpiar estados
        setProjectId(null);
        setProjectTitle(DEFAULT_PROJECT_TITLE);
        setAncho(DEFAULT_BOARD_WIDTH.toString());
        setAlto(DEFAULT_BOARD_HEIGHT.toString());
        setKerf("0");
        setMargen("0");
        setRotacion(true);
        setPiezas([]);
        setCargandoDatos(false);
        return;
      }

      setProjectId(targetProjectId);
      if (targetProjectId !== proyectoIdEnUrl) {
        router.replace(`/dashboard?proyecto=${targetProjectId}`, { scroll: false });
      }

      const { data: proyecto, error: projError } = await supabase
        .from("projects")
        .select("board_width, board_height, kerf, allow_rotation, title, margin")
        .eq("id", targetProjectId)
        .single();

      if (projError && projError.code !== "PGRST116") {
        throw new Error(`Error al cargar proyecto: ${projError.message}`);
      }

      if (proyecto) {
        setAncho(proyecto.board_width?.toString() ?? DEFAULT_BOARD_WIDTH.toString());
        setAlto(proyecto.board_height?.toString() ?? DEFAULT_BOARD_HEIGHT.toString());
        setKerf(proyecto.kerf?.toString() ?? "0");
        setRotacion(proyecto.allow_rotation ?? true);
        setProjectTitle(proyecto.title ?? DEFAULT_PROJECT_TITLE);
        setMargen(proyecto.margin?.toString() ?? "0");
      }

      const { data: piezasData, error: piezasError } = await supabase
        .from("pieces")
        .select("id, piece_name, width, height, quantity")
        .eq("user_id", authUser.id)
        .eq("project_id", targetProjectId);
      if (piezasError) throw new Error(`Error al cargar piezas: ${piezasError.message}`);

      setPiezas(
        (piezasData ?? []).map((p) => ({
          id: p.id || generateId(),
          piece_name: p.piece_name || "",
          width: p.width ?? "",
          height: p.height ?? "",
          quantity: p.quantity ?? 1,
        }))
      );
    } catch (err: any) {
      if (mountedRef.current) {
        setErrorInicial(
          err instanceof Error ? err.message : "Error desconocido al cargar el proyecto."
        );
      }
    } finally {
      if (mountedRef.current) {
        setCargandoDatos(false);
        if (loadTimeoutRef.current) clearTimeout(loadTimeoutRef.current);
      }
    }
  }, [proyectoIdEnUrl, router]);

  useEffect(() => {
    mountedRef.current = true;
    fetchInitialData();
    return () => {
      mountedRef.current = false;
      if (loadTimeoutRef.current) clearTimeout(loadTimeoutRef.current);
    };
  }, [fetchInitialData]);

  // ---------------------------------------------------------------------------
  // Operaciones CRUD del proyecto
  // ---------------------------------------------------------------------------
  const crearProyectoNuevo = useCallback(async () => {
    if (!user) return;
    try {
      const { data: nuevo, error } = await supabase
        .from("projects")
        .insert([
          {
            user_id: user.id,
            title: DEFAULT_PROJECT_TITLE,
            board_width: DEFAULT_BOARD_WIDTH,
            board_height: DEFAULT_BOARD_HEIGHT,
            kerf: 0,
            margin: 0,
            allow_rotation: true,
          },
        ])
        .select()
        .single();
      if (error) throw error;
      setProjectId(nuevo.id);
      router.replace(`/dashboard?proyecto=${nuevo.id}`, { scroll: false });
      setAncho(nuevo.board_width.toString());
      setAlto(nuevo.board_height.toString());
      setKerf(nuevo.kerf?.toString() ?? "0");
      setRotacion(nuevo.allow_rotation ?? true);
      setProjectTitle(nuevo.title ?? DEFAULT_PROJECT_TITLE);
      setPiezas([]);
      setResultadoCorte(null);
      toast.success("¡Proyecto creado con éxito!");
    } catch (err: any) {
      toast.error(err.message || "Error al crear el proyecto.");
    }
  }, [user, router]);

  const guardarTituloProyecto = useCallback(async () => {
    if (!projectId || !projectTitle.trim()) return;
    setGuardandoTitulo(true);
    try {
      const { error } = await supabase
        .from("projects")
        .update({ title: projectTitle.trim() })
        .eq("id", projectId);
      if (error) throw error;
      toast.success("Nombre del proyecto guardado.");
    } catch {
      toast.error("Error al guardar el título.");
    } finally {
      if (mountedRef.current) setGuardandoTitulo(false);
    }
  }, [projectId, projectTitle]);

  const guardarProyectoCompleto = useCallback(async () => {
    if (!user) return;
    const anchoNum = parseInt(ancho, 10);
    const altoNum = parseInt(alto, 10);
    if (!ancho || !alto || isNaN(anchoNum) || isNaN(altoNum) || anchoNum <= 0 || altoNum <= 0) {
      toast.error("Especifica medidas válidas para la lámina.");
      return;
    }
    if (piezas.length === 0) {
      toast.error("Agrega al menos una pieza.");
      return;
    }
    const algunaInvalida = piezas.some(
      (p) =>
        !p.piece_name.trim() ||
        !p.width ||
        Number(p.width) <= 0 ||
        !p.height ||
        Number(p.height) <= 0 ||
        !p.quantity ||
        Number(p.quantity) <= 0
    );
    if (algunaInvalida) {
      toast.error("Completa todos los campos de piezas con valores positivos.");
      return;
    }
    setGuardandoProyecto(true);
    try {
      let currentProjectId = projectId;
      const payloadProyecto = {
        board_width: anchoNum,
        board_height: altoNum,
        kerf: parseInt(kerf, 10) || 0,
        allow_rotation: rotacion,
        margin: parseInt(margen, 10) || 0,
      };
      if (!currentProjectId) {
        const { data: nuevo, error } = await supabase
          .from("projects")
          .insert([
            {
              ...payloadProyecto,
              title: projectTitle.trim() || DEFAULT_PROJECT_TITLE,
              user_id: user.id,
            },
          ])
          .select()
          .single();
        if (error) throw error;
        currentProjectId = nuevo.id;
        setProjectId(nuevo.id);
        router.replace(`/dashboard?proyecto=${nuevo.id}`, { scroll: false });
      } else {
        const { error } = await supabase
          .from("projects")
          .update({
            ...payloadProyecto,
            title: projectTitle.trim() || DEFAULT_PROJECT_TITLE,
          })
          .eq("id", currentProjectId);
        if (error) throw error;
      }
      // Reemplazar piezas antiguas por las actuales
      const { error: deleteErr } = await supabase
        .from("pieces")
        .delete()
        .eq("user_id", user.id)
        .eq("project_id", currentProjectId);
      if (deleteErr) throw new Error(`Error al limpiar piezas: ${deleteErr.message}`);
      const piezasInsert = piezas.map((p) => ({
        piece_name: p.piece_name.trim(),
        width: Number(p.width),
        height: Number(p.height),
        quantity: Number(p.quantity),
        user_id: user.id,
        project_id: currentProjectId,
      }));
      const { error: insertErr } = await supabase.from("pieces").insert(piezasInsert);
      if (insertErr) throw new Error(`Error al guardar piezas: ${insertErr.message}`);
      toast.success("¡Proyecto guardado correctamente!");
      setResultadoCorte(null);
    } catch (err: any) {
      toast.error(err.message || "Error desconocido al guardar el proyecto.");
    } finally {
      if (mountedRef.current) setGuardandoProyecto(false);
    }
  }, [user, ancho, alto, kerf, margen, rotacion, piezas, projectId, projectTitle, router]);

  // ---------------------------------------------------------------------------
  // Manejo de piezas en formulario
  // ---------------------------------------------------------------------------
  const agregarPieza = useCallback(() => {
    setPiezas((prev) => [
      ...prev,
      { id: generateId(), piece_name: "", width: "", height: "", quantity: 1 },
    ]);
    setResultadoCorte(null);
  }, []);

  const actualizarPieza = useCallback(
    (id: string, campo: keyof PiezaFormulario, valor: string | number) => {
      if (valor !== "") {
        const numValue = Number(valor);
        if ((campo === "width" || campo === "height" || campo === "quantity") && numValue < 0) {
          toast.error("No se permiten valores negativos.");
          return;
        }
        if (campo === "width" || campo === "height") {
          const boardW = parseInt(ancho, 10) || 0;
          const boardH = parseInt(alto, 10) || 0;
          if (rotacion) {
            const maxDim = Math.max(boardW, boardH);
            if (numValue > maxDim) {
              toast.error(`La medida excede el tamaño máximo de la lámina (${maxDim}mm).`);
              return;
            }
          } else {
            const limit = campo === "width" ? boardW : boardH;
            const label = campo === "width" ? "ancho" : "alto";
            if (numValue > limit) {
              toast.error(`El ${label} excede los ${limit}mm de la lámina (Rotación desactivada).`);
              return;
            }
          }
        }
      }
      setPiezas((prev) =>
        prev.map((p) => (p.id === id ? { ...p, [campo]: valor } : p))
      );
      setResultadoCorte(null);
    },
    [ancho, alto, rotacion]
  );

  const eliminarPieza = useCallback((id: string) => {
    setPiezas((prev) => prev.filter((p) => p.id !== id));
    setResultadoCorte(null);
  }, []);

  // ---------------------------------------------------------------------------
  // Optimización de corte
  // ---------------------------------------------------------------------------
  const calcularOptimizacion = useCallback(() => {
    const anchoNum = parseInt(ancho, 10);
    const altoNum = parseInt(alto, 10);
    if (isNaN(anchoNum) || isNaN(altoNum) || anchoNum <= 0 || altoNum <= 0) {
      toast.error("Define medidas de lámina válidas.");
      return;
    }
    if (piezas.length === 0) {
      toast.error("Agrega al menos una pieza.");
      return;
    }
    setCalculando(true);
    setTimeout(() => {
      if (!mountedRef.current) return;
      try {
        const piezasValidas = piezas
          .filter(
            (p) =>
              p.piece_name.trim() &&
              Number(p.width) > 0 &&
              Number(p.height) > 0 &&
              Number(p.quantity) > 0
          )
          .map((p) => ({
            id: p.piece_name.trim() || p.id,
            ancho: Number(p.width),
            alto: Number(p.height),
            cantidad: Number(p.quantity),
          }));

        if (piezasValidas.length === 0) {
          toast.error("Ninguna pieza tiene datos completos.");
          return;
        }
        const laminaBase = {
          id: "Lámina 1",
          ancho: anchoNum,
          alto: altoNum,
        };
        const resultado = optimizarCorteMultiLamina(
          [laminaBase],
          piezasValidas,
          parseInt(kerf, 10) || 0,
          rotacion,
          parseInt(margen, 10) || 0,
          parseInt(margen, 10) || 0,
          true
        );
        setResultadoCorte(resultado);
      } finally {
        if (mountedRef.current) setCalculando(false);
      }
    }, 0);
  }, [ancho, alto, piezas, kerf, margen, rotacion]);

  // ---------------------------------------------------------------------------
  // Exportación a PDF mejorada (profesional, sin elementos de interfaz)
  // ---------------------------------------------------------------------------
  const exportarAPDF = useCallback(async () => {
    if (!planoRef.current || !resultadoCorte) return;

    setGenerandoPDF(true);
    try {
      // Retardo dinámico según la cantidad de láminas para asegurar renderizado completo
      const laminasCount = resultadoCorte.laminasUsadas?.length ?? 1;
      const delay = Math.max(300, 400 + laminasCount * 200);

      await new Promise((resolve) =>
        requestAnimationFrame(() => setTimeout(resolve, delay))
      );

      // Capturar solo el área del plano (los elementos con clase "no-capture" se excluyen)
      const dataUrl = await toPng(planoRef.current, {
        pixelRatio: 2,
        backgroundColor: "#ffffff", // Fondo blanco para un acabado más limpio
        filter: (node) =>
          node instanceof HTMLElement
            ? !node.classList.contains("no-capture")
            : true,
      });

      // Crear PDF en orientación vertical A4
      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
      });

      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();

      // ---------- Encabezado profesional ----------
      const marginX = 15;
      const marginTop = 20;
      const titleLine1 = `Proyecto: ${projectTitle || DEFAULT_PROJECT_TITLE}`;
      const titleLine2 = `Fecha: ${new Date().toLocaleDateString("es-ES", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      })}`;

      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(14);
      pdf.text(titleLine1, marginX, marginTop);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(10);
      pdf.text(titleLine2, marginX, marginTop + 6);

      // Espacio reservado para el encabezado (en mm)
      const headerHeight = 18;

      // ---------- Imagen del plano ----------
      const img = new Image();
      img.src = dataUrl;
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
      });

      const availableWidth = pdfWidth - 2 * marginX;
      const availableHeight = pdfHeight - marginTop - headerHeight - 10; // margen inferior generoso

      const imgWidth = img.naturalWidth || img.width;
      const imgHeight = img.naturalHeight || img.height;

      const ratio = Math.min(
        availableWidth / imgWidth,
        availableHeight / imgHeight
      );
      const finalWidth = imgWidth * ratio;
      const finalHeight = imgHeight * ratio;

      // Centrar horizontalmente, justo debajo del encabezado
      const imgX = (pdfWidth - finalWidth) / 2;
      const imgY = marginTop + headerHeight + 2;

      // Añadir un sutil rectángulo de fondo para destacar el plano (opcional)
      pdf.setDrawColor(220, 220, 220);
      pdf.setLineWidth(0.5);
      pdf.rect(imgX - 1, imgY - 1, finalWidth + 2, finalHeight + 2, "S");

      pdf.addImage(dataUrl, "PNG", imgX, imgY, finalWidth, finalHeight);

      // Descargar
      pdf.save(`Plano_Cuttify_${projectTitle?.replace(/\s+/g, "_")}_${Date.now()}.pdf`);
      toast.success("PDF generado con éxito.");
    } catch (error) {
      console.error("Error al generar PDF:", error);
      toast.error("No se pudo generar el PDF.");
    } finally {
      if (mountedRef.current) setGenerandoPDF(false);
    }
  }, [resultadoCorte, projectTitle]);

  // ---------------------------------------------------------------------------
  // Vistas condicionales: carga, error, sin sesión, sin proyecto
  // ---------------------------------------------------------------------------
  if (cargandoDatos || errorInicial) {
    return (
      <div className="flex h-full items-center justify-center text-zinc-500 text-sm p-4">
        <div className="flex flex-col items-center gap-3">
          <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          {errorInicial ? (
            <>
              <p className="text-red-400 text-center">{errorInicial}</p>
              <button
                onClick={() => fetchInitialData()}
                className="text-blue-400 underline mt-2"
              >
                Reintentar
              </button>
            </>
          ) : (
            <p className="text-center">Cargando tu proyecto desde la nube...</p>
          )}
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex h-full items-center justify-center text-zinc-500 p-4">
        <p className="text-center">No se pudo cargar la sesión. Redirigiendo al login...</p>
      </div>
    );
  }

  if (!projectId) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-8 bg-zinc-950 text-white">
        <div className="w-16 h-16 bg-zinc-800/50 rounded-full flex items-center justify-center mb-4">
          <svg className="w-8 h-8 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
        </div>
        <h2 className="text-xl font-semibold mb-2">No tienes ningún proyecto activo</h2>
        <p className="text-zinc-400 mb-6 max-w-md">Crea un proyecto nuevo para empezar a definir láminas y piezas.</p>
        <button
          onClick={crearProyectoNuevo}
          className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2.5 rounded-lg text-sm font-medium transition-all shadow-md shadow-blue-900/20"
        >
          Crear mi primer proyecto
        </button>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render principal
  // ---------------------------------------------------------------------------
  return (
    <main className="flex-1 flex flex-col h-full bg-zinc-950 text-white print:bg-white print:text-black">
      {/* Barra superior móvil (título + hamburguesa) – Ocultada en PDF mediante no-capture */}
      <div className="lg:hidden flex items-center justify-between p-4 border-b border-zinc-800 bg-zinc-900/80 sticky top-0 z-30 print:hidden no-capture">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <input
            type="text"
            value={projectTitle}
            onChange={(e) => setProjectTitle(e.target.value)}
            className="bg-transparent text-base font-semibold text-white border-b border-transparent hover:border-zinc-700 focus:border-blue-500 focus:outline-none px-1 w-full"
            placeholder="Título del proyecto"
          />
          <button
            onClick={guardarTituloProyecto}
            disabled={guardandoTitulo}
            className="text-xs bg-zinc-800 hover:bg-zinc-700 text-white px-2.5 py-1 rounded-lg border border-zinc-700 transition-colors disabled:opacity-50 whitespace-nowrap"
          >
            {guardandoTitulo ? "…" : "Guardar"}
          </button>
        </div>
        <button
          onClick={() => setMenuMobileAbierto(true)}
          className="ml-3 p-2 bg-zinc-800 rounded-lg border border-zinc-700 text-zinc-300 hover:text-white focus:outline-none"
          aria-label="Abrir panel de configuración"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      </div>

      {/* Contenedor principal con scroll */}
      <div className="flex-1 overflow-y-auto p-4 lg:p-8 print:h-auto print:overflow-visible">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full print:block">
          {/* Área del plano (visualización) */}
          <div
            ref={planoRef}
            className="lg:col-span-2 bg-zinc-900/40 border border-zinc-800 rounded-xl p-4 lg:p-6 flex flex-col h-full min-h-[500px] lg:min-h-0 overflow-y-auto print:border-none print:shadow-none print:bg-white"
          >
            {/* Cabecera escritorio (visible solo en lg+) – no se captura en PDF */}
            <div className="hidden lg:flex items-center justify-between mb-4 no-capture">
              <div className="flex items-center gap-3">
                <input
                  type="text"
                  value={projectTitle}
                  onChange={(e) => setProjectTitle(e.target.value)}
                  className="bg-transparent text-lg font-semibold text-white border-b border-transparent hover:border-zinc-700 focus:border-blue-500 focus:outline-none px-1"
                  placeholder="Título del proyecto"
                />
                <button
                  onClick={guardarTituloProyecto}
                  disabled={guardandoTitulo}
                  className="text-xs bg-zinc-800 hover:bg-zinc-700 text-white px-3 py-1 rounded-lg border border-zinc-700 transition-colors disabled:opacity-50"
                >
                  {guardandoTitulo ? "…" : "Guardar nombre"}
                </button>
              </div>
              {resultadoCorte && (
                <div className="flex gap-2">
                  <button
                    onClick={exportarAPDF}
                    disabled={generandoPDF}
                    className="no-capture text-xs bg-zinc-800 hover:bg-zinc-700 text-white px-3 py-1.5 rounded-lg transition-colors border border-zinc-700 flex items-center gap-2 disabled:opacity-50"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                    </svg>
                    {generandoPDF ? "Generando…" : "PDF"}
                  </button>
                  <button
                    onClick={() => window.print()}
                    className="no-capture text-xs bg-zinc-800 hover:bg-zinc-700 text-white px-3 py-1.5 rounded-lg transition-colors border border-zinc-700 flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                    </svg>
                  </button>
                </div>
              )}
            </div>

            {/* Resumen y botones en mobile – no capturados */}
            {resultadoCorte && (
              <div className="lg:hidden mb-4 no-capture">
                <ResumenRendimiento
                  eficiencia={resultadoCorte.resumen.eficienciaGlobal}
                  areaTotalM2={resultadoCorte.resumen.areaTotalM2}
                  areaUsadaM2={resultadoCorte.resumen.areaUsadaM2}
                  areaDesperdicioM2={resultadoCorte.resumen.areaDesperdicioM2}
                  piezasColocadas={resultadoCorte.resumen.piezasColocadas}
                  piezasTotales={resultadoCorte.resumen.piezasTotales}
                  totalLaminas={resultadoCorte.laminasUsadas.length}
                />
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={exportarAPDF}
                    disabled={generandoPDF}
                    className="flex-1 no-capture text-xs bg-zinc-800 hover:bg-zinc-700 text-white px-3 py-2 rounded-lg transition-colors border border-zinc-700 flex items-center justify-center gap-1 disabled:opacity-50"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                    </svg>
                    {generandoPDF ? "Generando…" : "PDF"}
                  </button>
                  <button
                    onClick={() => window.print()}
                    className="flex-1 no-capture text-xs bg-zinc-800 hover:bg-zinc-700 text-white px-3 py-2 rounded-lg transition-colors border border-zinc-700 flex items-center justify-center gap-1"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                    </svg>
                    Imprimir
                  </button>
                </div>
              </div>
            )}

            {/* Visualización del plano de corte */}
            <div className="flex-1 min-h-[300px] lg:min-h-[400px] flex flex-col overflow-hidden bg-zinc-950 border border-zinc-800 rounded-lg mt-2 print:border-none print:bg-transparent">
              {resultadoCorte ? (
                <CorteVisualizer
                  resultado={{
                    laminasUsadas: resultadoCorte.laminasUsadas,
                    noColocadas: resultadoCorte.noColocadas,
                    todasColocadas: resultadoCorte.noColocadas.length === 0,
                  }}
                />
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-zinc-600 space-y-4 print:hidden p-4">
                  <svg className="w-12 h-12 md:w-16 md:h-16 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
                      d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
                  </svg>
                  <p className="text-sm text-center">Ingresa medidas y piezas para ver el plano</p>
                </div>
              )}
            </div>

            <button
              onClick={calcularOptimizacion}
              disabled={
                calculando ||
                !ancho ||
                !alto ||
                piezas.length === 0 ||
                parseInt(ancho, 10) <= 0 ||
                parseInt(alto, 10) <= 0
              }
              className={`no-capture mt-4 w-full text-white text-sm font-medium py-3 rounded-lg transition-all shadow-md shrink-0 ${
                calculando ||
                !ancho ||
                !alto ||
                piezas.length === 0 ||
                parseInt(ancho, 10) <= 0 ||
                parseInt(alto, 10) <= 0
                  ? "bg-purple-800/50 cursor-not-allowed opacity-70"
                  : "bg-purple-600 hover:bg-purple-700 shadow-purple-900/20"
              }`}
            >
              {calculando ? "Calculando corte…" : "Calcular Corte"}
            </button>
          </div>

          {/* Panel derecho (configuración) – visible solo en escritorio */}
          <aside className="hidden lg:flex flex-col gap-6 h-full overflow-y-auto print:hidden">
            <PanelConfiguracion
              ancho={ancho}
              setAncho={setAncho}
              alto={alto}
              setAlto={setAlto}
              kerf={kerf}
              setKerf={setKerf}
              margen={margen}
              setMargen={setMargen}
              rotacion={rotacion}
              setRotacion={setRotacion}
              piezas={piezas}
              agregarPieza={agregarPieza}
              actualizarPieza={actualizarPieza}
              eliminarPieza={eliminarPieza}
              guardarProyectoCompleto={guardarProyectoCompleto}
              guardandoProyecto={guardandoProyecto}
              onResultadoReset={() => setResultadoCorte(null)}
            />
          </aside>
        </div>
      </div>

      {/* Overlay del panel de configuración en mobile */}
      {menuMobileAbierto && (
        <div className="fixed inset-0 z-50 lg:hidden print:hidden no-capture">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setMenuMobileAbierto(false)}
          />
          <div className="absolute right-0 top-0 bottom-0 w-full max-w-sm bg-zinc-950 border-l border-zinc-800 p-5 overflow-y-auto shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-bold text-white">Configuración y Piezas</h2>
              <button
                onClick={() => setMenuMobileAbierto(false)}
                className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-white"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <PanelConfiguracion
              ancho={ancho}
              setAncho={setAncho}
              alto={alto}
              setAlto={setAlto}
              kerf={kerf}
              setKerf={setKerf}
              margen={margen}
              setMargen={setMargen}
              rotacion={rotacion}
              setRotacion={setRotacion}
              piezas={piezas}
              agregarPieza={agregarPieza}
              actualizarPieza={actualizarPieza}
              eliminarPieza={eliminarPieza}
              guardarProyectoCompleto={guardarProyectoCompleto}
              guardandoProyecto={guardandoProyecto}
              onResultadoReset={() => setResultadoCorte(null)}
              dentroDeDrawer
            />
          </div>
        </div>
      )}
    </main>
  );
}

// -----------------------------------------------------------------------------
// Componente PanelConfiguracion (tipado)
// -----------------------------------------------------------------------------
function PanelConfiguracion({
  ancho,
  setAncho,
  alto,
  setAlto,
  kerf,
  setKerf,
  margen,
  setMargen,
  rotacion,
  setRotacion,
  piezas,
  agregarPieza,
  actualizarPieza,
  eliminarPieza,
  guardarProyectoCompleto,
  guardandoProyecto,
  onResultadoReset,
  dentroDeDrawer = false,
}: PanelConfiguracionProps) {
  return (
    <>
      {/* Configuración de lámina */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 shadow-lg shrink-0">
        <h3 className="text-lg font-semibold text-white mb-2">Configurar Lámina</h3>
        <p className="text-sm text-zinc-400 mb-4">Medidas base y opciones de corte.</p>
        <form className="flex flex-col gap-4" onSubmit={(e) => e.preventDefault()}>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs font-medium text-zinc-400 mb-1">Ancho (mm)</label>
              <input
                type="number"
                value={ancho}
                onChange={(e) => {
                  setAncho(e.target.value);
                  onResultadoReset();
                }}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2.5 text-white placeholder-zinc-600 focus:outline-none focus:border-blue-500 text-sm"
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs font-medium text-zinc-400 mb-1">Alto (mm)</label>
              <input
                type="number"
                value={alto}
                onChange={(e) => {
                  setAlto(e.target.value);
                  onResultadoReset();
                }}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2.5 text-white placeholder-zinc-600 focus:outline-none focus:border-blue-500 text-sm"
              />
            </div>
          </div>
          <div className="flex gap-3 pt-2 border-t border-zinc-800">
            <div className="flex-1">
              <label className="block text-xs font-medium text-zinc-400 mb-1">Kerf (mm)</label>
              <input
                type="number"
                value={kerf}
                onChange={(e) => {
                  setKerf(e.target.value);
                  onResultadoReset();
                }}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2.5 text-white placeholder-zinc-600 focus:outline-none focus:border-blue-500 text-sm"
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs font-medium text-zinc-400 mb-1">Margen (mm)</label>
              <input
                type="number"
                value={margen}
                onChange={(e) => {
                  setMargen(e.target.value);
                  onResultadoReset();
                }}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2.5 text-white placeholder-zinc-600 focus:outline-none focus:border-blue-500 text-sm"
              />
            </div>
          </div>
          <div className="flex items-center gap-2 mb-1">
            <input
              type="checkbox"
              id="rotacion"
              checked={rotacion}
              onChange={(e) => {
                setRotacion(e.target.checked);
                onResultadoReset();
              }}
              className="rounded bg-zinc-950 border-zinc-800 text-blue-500 focus:ring-blue-500 focus:ring-offset-zinc-900"
            />
            <label
              htmlFor="rotacion"
              className="text-xs font-medium text-zinc-400 cursor-pointer select-none"
            >
              Permitir rotar piezas
            </label>
          </div>
        </form>
      </div>

      {/* Lista de piezas + botón de guardado */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 shadow-lg flex flex-col min-h-0 flex-1">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h3 className="text-lg font-semibold text-white">Lista de Piezas</h3>
            <p className="text-xs text-zinc-400 mt-1">Cantidades y dimensiones.</p>
          </div>
          <button
            onClick={agregarPieza}
            className="bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
          >
            + Agregar
          </button>
        </div>
        <div className="flex flex-col gap-3 overflow-y-auto pr-1 pb-2 max-h-[45vh] lg:max-h-none">
          {piezas.length === 0 ? (
            <div className="text-center py-8 text-zinc-500 text-sm border border-dashed border-zinc-800 rounded-xl bg-zinc-950/50">
              No has agregado piezas aún.
            </div>
          ) : (
            piezas.map((pieza) => (
              <div
                key={pieza.id}
                className="flex flex-wrap items-center gap-2 bg-zinc-950 p-3 rounded-xl border border-zinc-800/80"
              >
                <input
                  type="text"
                  placeholder="Nombre"
                  value={pieza.piece_name}
                  onChange={(e) => actualizarPieza(pieza.id, "piece_name", e.target.value)}
                  className="flex-1 min-w-[80px] bg-transparent text-white text-xs border-b border-zinc-800 focus:border-blue-500 focus:outline-none px-1 py-1"
                />
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    placeholder="Ancho"
                    value={pieza.width}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === "") actualizarPieza(pieza.id, "width", "");
                      else {
                        const num = parseInt(val, 10);
                        if (!isNaN(num)) actualizarPieza(pieza.id, "width", num);
                      }
                    }}
                    className="w-16 bg-transparent text-white text-xs border-b border-zinc-800 focus:border-blue-500 focus:outline-none px-1 py-1 text-center"
                  />
                  <span className="text-zinc-600 text-xs">x</span>
                  <input
                    type="number"
                    placeholder="Alto"
                    value={pieza.height}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === "") actualizarPieza(pieza.id, "height", "");
                      else {
                        const num = parseInt(val, 10);
                        if (!isNaN(num)) actualizarPieza(pieza.id, "height", num);
                      }
                    }}
                    className="w-16 bg-transparent text-white text-xs border-b border-zinc-800 focus:border-blue-500 focus:outline-none px-1 py-1 text-center"
                  />
                </div>
                <div className="flex items-center ml-1 border-l border-zinc-800 pl-2">
                  <span className="text-zinc-500 text-xs mr-1">Cant:</span>
                  <input
                    type="number"
                    min="1"
                    value={pieza.quantity}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === "") actualizarPieza(pieza.id, "quantity", "");
                      else {
                        const num = parseInt(val, 10);
                        if (!isNaN(num)) actualizarPieza(pieza.id, "quantity", num);
                      }
                    }}
                    className="w-12 bg-zinc-900 text-white text-xs border border-zinc-700 rounded focus:border-blue-500 focus:outline-none px-1 py-1 text-center font-bold"
                  />
                </div>
                <button
                  onClick={() => eliminarPieza(pieza.id)}
                  className="ml-auto text-zinc-600 hover:text-red-400 p-1.5 transition-colors"
                  title="Eliminar"
                >
                  ✕
                </button>
              </div>
            ))
          )}
        </div>
        <button
          type="button"
          onClick={guardarProyectoCompleto}
          disabled={guardandoProyecto || piezas.length === 0}
          className={`mt-4 w-full text-white text-sm font-medium py-2.5 rounded-lg transition-all shadow-md shrink-0 ${
            guardandoProyecto || piezas.length === 0
              ? "bg-emerald-800/50 cursor-not-allowed opacity-70"
              : "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-900/20"
          }`}
        >
          {guardandoProyecto ? "Guardando proyecto…" : "Guardar Proyecto"}
        </button>
      </div>
    </>
  );
}

// -----------------------------------------------------------------------------
// Página con Suspense
// -----------------------------------------------------------------------------
export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="h-screen flex items-center justify-center bg-zinc-950 text-white">
          Cargando Cuttify…
        </div>
      }
    >
      <DashboardContent />
    </Suspense>
  );
}
