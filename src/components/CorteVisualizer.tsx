import React from "react";

// --- 1. INTERFACES (Tipado estricto) ---
export interface Lamina {
  id: number | string;
  ancho: number;
  alto: number;
}

export interface PiezaColocada {
  id: string;
  x: number;
  y: number;
  realAncho: number;
  realAlto: number;
  ancho: number;       // inflada con kerf
  alto: number;
  veta?: "paralela" | "perpendicular" | "sin_restriccion";
  direccionVeta?: "paralela" | "perpendicular"; // Soporte extra por si viene del backend
}

export interface LaminaResultado {
  lamina: Lamina;
  colocadas: PiezaColocada[];
}

export interface Props {
  resultado: {
    laminasUsadas: LaminaResultado[];
    todasColocadas?: boolean;
    noColocadas?: any[]; // Por si quedan piezas por fuera
  };
}

// --- 2. COMPONENTE: Flecha de Veta ---
const VetaArrow: React.FC<{ pieza: PiezaColocada }> = ({ pieza }) => {
  const orientacionVeta = pieza.veta || pieza.direccionVeta;
  if (!orientacionVeta || orientacionVeta === "sin_restriccion") return null;

  const { x, y, realAncho, realAlto } = pieza;
  
  // Encontramos el centro exacto de la pieza
  const centroX = x + realAncho / 2;
  const centroY = y + realAlto / 2;
  
  const ladoMenor = Math.min(realAncho, realAlto);
  const largoFlecha = ladoMenor * 0.3; 
  const color = "#5c3626"; // Madera oscuro

  // Lógica matemática: Determinar si la veta corre horizontal o vertical en la pantalla
  const horizontal =
    (orientacionVeta === "paralela" && realAncho >= realAlto) ||
    (orientacionVeta === "perpendicular" && realAlto > realAncho);

  return (
    <line
      x1={horizontal ? centroX - largoFlecha : centroX}
      y1={horizontal ? centroY : centroY - largoFlecha}
      x2={horizontal ? centroX + largoFlecha : centroX}
      y2={horizontal ? centroY : centroY + largoFlecha}
      stroke={color}
      strokeWidth={Math.max(2, ladoMenor * 0.015)}
      markerEnd="url(#arrowhead)"
    />
  );
};

// --- 3. COMPONENTE: Motor de Renderizado de la Lámina (SVG) ---
const LaminaSVG: React.FC<{ lamina: Lamina; piezas: PiezaColocada[] }> = ({ lamina, piezas }) => {
  const { ancho, alto, id } = lamina;
  
  // Proporción base para que los grosores de línea se vean bien sin importar si la lámina es gigante o pequeña
  const proporcionBase = Math.max(ancho, alto) * 0.0015;

  return (
    <div className="mb-8 w-full bg-zinc-900/50 p-6 rounded-xl border border-zinc-800 shadow-inner">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-zinc-100 font-bold text-lg flex items-center gap-2">
          <div className="w-3 h-3 bg-emerald-500 rounded-full"></div>
          Lámina {id}
        </h3>
        <span className="text-zinc-400 text-sm bg-zinc-800 px-3 py-1 rounded-full font-medium">
          {ancho} x {alto} mm
        </span>
      </div>
      
      <div className="w-full relative overflow-hidden flex items-center justify-center bg-zinc-950 p-4 rounded-lg border border-zinc-800/50">
        
        {/* LA CÁMARA: viewBox define el mundo real en milímetros */}
        <svg
          viewBox={`0 0 ${ancho} ${alto}`}
          className="w-full h-auto max-h-[65vh] drop-shadow-2xl"
          preserveAspectRatio="xMidYMid meet"
        >
          <defs>
            <marker id="arrowhead" markerWidth="6" markerHeight="4" refX="5" refY="2" orient="auto">
              <polygon points="0 0, 6 2, 0 4" fill="#5c3626" />
            </marker>
          </defs>

          {/* CAPA 0: Fondo (El retal/sobrante) */}
          <rect
            x={0}
            y={0}
            width={ancho}
            height={alto}
            fill="#45271d" 
            stroke="#5c3626"
            strokeWidth={proporcionBase * 4}
          />

          {/* CAPA 1 y 2: Instanciación de Piezas */}
          {piezas.map((pieza, i) => {
            const tamanoFuenteNombre = Math.min(pieza.realAncho, pieza.realAlto) * 0.15;
            const tamanoFuenteMedida = Math.min(pieza.realAncho, pieza.realAlto) * 0.1;

            return (
              <g key={`${pieza.id}-${i}`} className="group cursor-pointer">
                {/* Tooltip nativo del navegador */}
                <title>{pieza.id}: {pieza.realAncho} x {pieza.realAlto} mm</title>

                {/* Bloque de madera */}
                <rect
                  x={pieza.x}
                  y={pieza.y}
                  width={pieza.realAncho}
                  height={pieza.realAlto}
                  fill="#d4a373" 
                  stroke="#283618" 
                  strokeWidth={proporcionBase * 2}
                  className="transition-all duration-300 group-hover:fill-amber-300 group-hover:stroke-amber-900"
                />

                {/* Kerf (Sangría) - Línea punteada roja si la pieza está inflada */}
                {(pieza.ancho > pieza.realAncho || pieza.alto > pieza.realAlto) && (
                  <rect
                    x={pieza.x - (pieza.ancho - pieza.realAncho) / 2}
                    y={pieza.y - (pieza.alto - pieza.realAlto) / 2}
                    width={pieza.ancho}
                    height={pieza.alto}
                    fill="none"
                    stroke="#e63946" 
                    strokeWidth={proporcionBase}
                    strokeDasharray={`${proporcionBase * 4} ${proporcionBase * 4}`}
                    className="opacity-60"
                  />
                )}

                {/* Flecha de veta */}
                <VetaArrow pieza={pieza} />

                {/* Etiquetas de texto */}
                <text
                  x={pieza.x + pieza.realAncho / 2}
                  y={pieza.y + pieza.realAlto / 2 - (tamanoFuenteMedida / 2)}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={tamanoFuenteNombre}
                  fill="#1a1a1a" 
                  fontWeight="bold"
                  fontFamily="sans-serif"
                  className="pointer-events-none select-none"
                >
                  {pieza.id}
                </text>

                <text
                  x={pieza.x + pieza.realAncho / 2}
                  y={pieza.y + pieza.realAlto / 2 + (tamanoFuenteNombre / 2) + 2}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={tamanoFuenteMedida}
                  fill="#333"
                  fontFamily="sans-serif"
                  className="pointer-events-none select-none"
                >
                  {pieza.realAncho} x {pieza.realAlto}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
};

// --- 4. COMPONENTE PRINCIPAL ---
const CorteVisualizer: React.FC<Props> = ({ resultado }) => {
  if (!resultado || !resultado.laminasUsadas || resultado.laminasUsadas.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center bg-zinc-900/50 rounded-xl border border-zinc-800 h-full">
        <svg className="w-16 h-16 text-zinc-700 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7" />
        </svg>
        <p className="text-zinc-400 font-medium">Usa "Calcular Corte" para renderizar el plano aquí.</p>
      </div>
    );
  }

  // Comprobación de si faltaron piezas por colocar (maneja ambas lógicas)
  const faltaronPiezas = resultado.todasColocadas === false || (resultado.noColocadas && resultado.noColocadas.length > 0);

  return (
    <div className="w-full h-full overflow-y-auto pr-2 custom-scrollbar">
      {resultado.laminasUsadas.map((laminaRes, index) => (
        <LaminaSVG
          key={laminaRes.lamina.id || index}
          lamina={laminaRes.lamina}
          piezas={laminaRes.colocadas}
        />
      ))}
      
      {faltaronPiezas && (
        <div className="mt-4 p-4 bg-red-950/40 border border-red-500/50 rounded-xl flex items-start gap-4 animate-pulse">
          <span className="text-red-500 text-2xl mt-1">⚠️</span>
          <div>
            <h4 className="text-red-400 font-bold text-lg">Material Insuficiente</h4>
            <p className="text-red-200/70 text-sm mt-1">
              Algunas piezas no cupieron en el material disponible. Verifica las dimensiones máximas o agrega más láminas al proyecto.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default CorteVisualizer;