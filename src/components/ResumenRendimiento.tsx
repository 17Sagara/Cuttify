// src/components/ResumenRendimiento.tsx
import React from "react";

// 1. Definimos qué datos (Props) necesita recibir este componente para funcionar.
interface Props {
  eficiencia: number;        // Porcentaje de 0 a 100
  areaTotalM2: number;       // Área de la lámina en metros cuadrados
  areaUsadaM2: number;       // Área cubierta por las piezas en metros cuadrados
  areaDesperdicioM2: number; // Lo que sobró (retal)
  piezasColocadas: number;   // Cantidad de piezas que sí cupieron
  piezasTotales: number;     // Total de piezas que el usuario pidió
  totalLaminas: number;      // <-- ¡AÑADIDO! Total de láminas utilizadas
}

export default function ResumenRendimiento({
  eficiencia,
  areaTotalM2,
  areaUsadaM2,
  areaDesperdicioM2,
  piezasColocadas,
  piezasTotales,
  totalLaminas,              // <-- Recibimos la nueva propiedad
}: Props) {
  
  // 2. Lógica visual: Cambiamos los colores dependiendo de qué tan buena sea la eficiencia.
  // Esto ayuda al usuario a saber de reojo si su corte es bueno o malo.
  const esExcelente = eficiencia >= 85;
  const esAceptable = eficiencia >= 70 && eficiencia < 85;
  
  const colorEficiencia = esExcelente
    ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10" // Verde
    : esAceptable
    ? "text-amber-400 border-amber-500/30 bg-amber-500/10"       // Amarillo
    : "text-red-400 border-red-500/30 bg-red-500/10";            // Rojo

  return (
    // Ajustamos el grid a 5 columnas (lg:grid-cols-5) para que quepan las 5 tarjetas en pantallas grandes
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
      
      {/* Tarjeta 1: Porcentaje de Eficiencia */}
      <div className={`p-4 rounded-xl border flex flex-col justify-center ${colorEficiencia}`}>
        <span className="text-xs font-medium uppercase tracking-wider block opacity-80 mb-1">
          Eficiencia
        </span>
        <span className="text-2xl font-bold">{eficiencia.toFixed(1)}%</span>
      </div>

      {/* Tarjeta NUEVA: Láminas Usadas */}
      <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/60 text-zinc-200">
        <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider block mb-1">
          Láminas Usadas
        </span>
        <span className="text-2xl font-bold text-white">
          {totalLaminas} <span className="text-sm font-normal text-zinc-500">und</span>
        </span>
      </div>

      {/* Tarjeta 3: Material Usado */}
      <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/60 text-zinc-200">
        <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider block mb-1">
          Área Útil
        </span>
        {/* .toFixed(2) asegura que solo mostremos 2 decimales (ej: 2.45 m²) */}
        <span className="text-2xl font-bold text-white">
          {areaUsadaM2.toFixed(2)} <span className="text-sm font-normal text-zinc-500">m²</span>
        </span>
      </div>

      {/* Tarjeta 4: Desperdicio (Retal) */}
      <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/60 text-zinc-200">
        <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider block mb-1">
          Retal (Sobrante)
        </span>
        <span className="text-2xl font-bold text-white">
          {areaDesperdicioM2.toFixed(2)} <span className="text-sm font-normal text-zinc-500">m²</span>
        </span>
      </div>

      {/* Tarjeta 5: Estado de las piezas */}
      <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/60 text-zinc-200">
        <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider block mb-1">
          Piezas Cortadas
        </span>
        <span className="text-2xl font-bold text-white">
          {piezasColocadas} <span className="text-sm font-normal text-zinc-500">/ {piezasTotales}</span>
        </span>
      </div>

    </div>
  );
}