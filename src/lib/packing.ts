// lib/packing.ts

// ─── TIPOS ────────────────────────────────────────────────
export interface PiezaBruta {
  id: string;
  ancho: number;
  alto: number;
  cantidad: number;
  direccionVeta?: 'paralela' | 'perpendicular';
}

export interface PiezaColocada {
  id: string;
  x: number;
  y: number;
  ancho: number;       // incluye kerf
  alto: number;        // incluye kerf
  realAncho: number;
  realAlto: number;
}

export interface Lamina {
  id: string | number;
  ancho: number;
  alto: number;
  grosor?: number;
}

export interface EspacioLibre {
  x: number;
  y: number;
  ancho: number;
  alto: number;
}

export interface ResultadoPacking {
  colocadas: PiezaColocada[];
  noColocadas: PiezaBruta[];
  eficiencia: number;            // porcentaje (0-100)
  areaUsadaMm2: number;          // área real ocupada en mm²
  areaDesperdicioMm2: number;    // área desperdiciada en mm²
  espaciosLibresFinales: EspacioLibre[];
  lamina: Lamina;
}

export interface ResumenRendimientoGlobal {
  totalLaminas: number;
  eficienciaGlobal: number;
  areaTotalM2: number;
  areaUsadaM2: number;
  areaDesperdicioM2: number;
  piezasColocadas: number;
  piezasTotales: number;
}

export interface ResultadoMultiLamina {
  laminasUsadas: ResultadoPacking[];
  noColocadas: PiezaBruta[];
  eficienciaGeneral: number;
  laminasTotales: number;
  resumen: ResumenRendimientoGlobal;
}

// ─── CONSTANTES ──────────────────────────────────────────
const MAX_LAMINAS_AUTOGENERADAS = 10;

// ─── FUNCIONES AUXILIARES ────────────────────────────────

/** Calcula área en mm² */
function area(ancho: number, alto: number): number {
  return ancho * alto;
}

/** Expande piezas con cantidad > 1 en elementos individuales */
function expandirPiezas(piezas: PiezaBruta[]): PiezaBruta[] {
  const planas: PiezaBruta[] = [];
  for (const p of piezas) {
    for (let i = 0; i < p.cantidad; i++) {
      planas.push({ ...p, cantidad: 1 });
    }
  }
  return planas;
}

/** Ordena piezas de mayor a menor área (y en caso de empate, lado mayor) */
function ordenarPiezas(piezas: PiezaBruta[]): PiezaBruta[] {
  return [...piezas].sort((a, b) => {
    const areaA = area(a.ancho, a.alto);
    const areaB = area(b.ancho, b.alto);
    if (areaB !== areaA) return areaB - areaA;
    const maxA = Math.max(a.ancho, a.alto);
    const maxB = Math.max(b.ancho, b.alto);
    return maxB - maxA;
  });
}

/**
 * Determina orientaciones válidas según rotación y veta.
 */
function obtenerOrientacionesValidas(
  pieza: PiezaBruta,
  permitirRotacion: boolean,
  laminaAncho: number,
  laminaAlto: number
): { ancho: number; alto: number }[] {
  const original = { ancho: pieza.ancho, alto: pieza.alto };

  // Sin rotación o pieza cuadrada
  if (!permitirRotacion || pieza.ancho === pieza.alto) return [original];

  const orientaciones = [
    original,
    { ancho: pieza.alto, alto: pieza.ancho },
  ];

  // Sin restricción de veta
  if (!pieza.direccionVeta) return orientaciones;
  // Lámina cuadrada → veta irrelevante
  if (laminaAncho === laminaAlto) return orientaciones;

  const laminaLargoY = laminaAlto > laminaAncho;

  return orientaciones.filter((o) => {
    const piezaLargoY = o.alto > o.ancho;
    if (pieza.direccionVeta === 'paralela') {
      return piezaLargoY === laminaLargoY;
    } else {
      return piezaLargoY !== laminaLargoY;
    }
  });
}

/**
 * Encuentra el mejor espacio libre usando Best Short Side Fit.
 * Penaliza fragmentos estrechos para evitar sobrantes difíciles de usar.
 */
function encontrarMejorEspacio(
  piezaAncho: number,
  piezaAlto: number,
  espacios: EspacioLibre[]
): { indice: number; espacio: EspacioLibre } | null {
  // Ordenar espacios por área ascendente reduce comparaciones
  const indicesPorArea = espacios
    .map((e, i) => ({ i, area: area(e.ancho, e.alto) }))
    .sort((a, b) => a.area - b.area);

  let mejorIndice = -1;
  let mejorScore = Infinity;

  for (const { i } of indicesPorArea) {
    const e = espacios[i];
    if (piezaAncho <= e.ancho && piezaAlto <= e.alto) {
      const sobranteX = e.ancho - piezaAncho;
      const sobranteY = e.alto - piezaAlto;
      const score = area(sobranteX, sobranteY) + Math.min(sobranteX, sobranteY) * 5;
      if (score < mejorScore) {
        mejorScore = score;
        mejorIndice = i;
      }
    }
  }

  return mejorIndice < 0 ? null : { indice: mejorIndice, espacio: espacios[mejorIndice] };
}

/**
 * Elimina espacios contenidos en otros y fusiona adyacentes.
 * Versión optimizada con un solo barrido y fusión por pares.
 */
function fusionarEspacios(espacios: EspacioLibre[]): EspacioLibre[] {
  // Paso 1: eliminar contenidos completamente dentro de otros
  const filtrados: EspacioLibre[] = [];
  for (const a of espacios) {
    let contenido = false;
    for (const b of espacios) {
      if (a === b) continue;
      if (
        a.x >= b.x && a.y >= b.y &&
        a.x + a.ancho <= b.x + b.ancho &&
        a.y + a.alto <= b.y + b.alto
      ) {
        contenido = true;
        break;
      }
    }
    if (!contenido) filtrados.push({ ...a });
  }

  // Paso 2: fusionar adyacentes horizontales (misma altura, misma y)
  const horizontales = [...filtrados];
  let fusionado: boolean;
  do {
    fusionado = false;
    for (let i = 0; i < horizontales.length; i++) {
      for (let j = i + 1; j < horizontales.length; j++) {
        const a = horizontales[i], b = horizontales[j];
        if (a.alto === b.alto && a.y === b.y) {
          if (a.x + a.ancho === b.x) {
            horizontales[i] = { x: a.x, y: a.y, ancho: a.ancho + b.ancho, alto: a.alto };
            horizontales.splice(j, 1);
            fusionado = true;
            break;
          }
          if (b.x + b.ancho === a.x) {
            horizontales[i] = { x: b.x, y: a.y, ancho: a.ancho + b.ancho, alto: a.alto };
            horizontales.splice(j, 1);
            fusionado = true;
            break;
          }
        }
      }
      if (fusionado) break;
    }
  } while (fusionado);

  // Paso 3: fusionar adyacentes verticales (misma anchura, misma x)
  const resultado = [...horizontales];
  do {
    fusionado = false;
    for (let i = 0; i < resultado.length; i++) {
      for (let j = i + 1; j < resultado.length; j++) {
        const a = resultado[i], b = resultado[j];
        if (a.ancho === b.ancho && a.x === b.x) {
          if (a.y + a.alto === b.y) {
            resultado[i] = { x: a.x, y: a.y, ancho: a.ancho, alto: a.alto + b.alto };
            resultado.splice(j, 1);
            fusionado = true;
            break;
          }
          if (b.y + b.alto === a.y) {
            resultado[i] = { x: a.x, y: b.y, ancho: a.ancho, alto: a.alto + b.alto };
            resultado.splice(j, 1);
            fusionado = true;
            break;
          }
        }
      }
      if (fusionado) break;
    }
  } while (fusionado);

  return resultado;
}

/**
 * Aplica corte guillotina, eligiendo el que deja mayor área libre máxima.
 */
function aplicarCorteGuillotina(
  x: number, y: number, W: number, H: number,
  anchoInf: number, altoInf: number
): { e1: EspacioLibre; e2: EspacioLibre } {
  const maxAreaH = Math.max(
    area(W - anchoInf, altoInf),
    area(W, H - altoInf)
  );
  const maxAreaV = Math.max(
    area(W - anchoInf, H),
    area(anchoInf, H - altoInf)
  );

  if (maxAreaH >= maxAreaV) {
    return {
      e1: { x: x + anchoInf, y, ancho: W - anchoInf, alto: altoInf },
      e2: { x, y: y + altoInf, ancho: W, alto: H - altoInf },
    };
  } else {
    return {
      e1: { x: x + anchoInf, y, ancho: W - anchoInf, alto: H },
      e2: { x, y: y + altoInf, ancho: anchoInf, alto: H - altoInf },
    };
  }
}

/**
 * Coloca la pieza en el espacio seleccionado, actualiza lista de espacios.
 */
function colocarPiezaEnEspacio(
  espacios: EspacioLibre[],
  indiceEspacio: number,
  anchoInflado: number,
  altoInflado: number,
  id: string,
  realAncho: number,
  realAlto: number
): PiezaColocada {
  const espacio = espacios[indiceEspacio];
  const { x, y, ancho: W, alto: H } = espacio;
  espacios.splice(indiceEspacio, 1);

  const { e1, e2 } = aplicarCorteGuillotina(x, y, W, H, anchoInflado, altoInflado);

  if (e1.ancho > 0 && e1.alto > 0) espacios.push(e1);
  if (e2.ancho > 0 && e2.alto > 0) espacios.push(e2);

  // Fusión inmediata para mantener pocos espacios
  fusionarEspacios(espacios);

  return {
    id,
    x,
    y,
    ancho: anchoInflado,
    alto: altoInflado,
    realAncho,
    realAlto,
  };
}

// ─── OPTIMIZACIÓN DE UNA LÁMINA ─────────────────────────
export function optimizarCorteLamina(
  lamina: Lamina,
  piezasOriginales: PiezaBruta[],
  kerf: number = 0,
  permitirRotacion: boolean = true,
  margenX: number = 0,
  margenY: number = 0
): ResultadoPacking {
  // Validaciones
  if (kerf < 0) kerf = 0;
  if (margenX < 0) margenX = 0;
  if (margenY < 0) margenY = 0;

  const anchoUtil = lamina.ancho - 2 * margenX;
  const altoUtil = lamina.alto - 2 * margenY;

  if (anchoUtil <= 0 || altoUtil <= 0) {
    return {
      colocadas: [],
      noColocadas: piezasOriginales.map(p => ({ ...p })),
      eficiencia: 0,
      areaUsadaMm2: 0,
      areaDesperdicioMm2: lamina.ancho * lamina.alto,
      espaciosLibresFinales: [],
      lamina,
    };
  }

  const piezasExpandidas = expandirPiezas(piezasOriginales);
  const piezasOrdenadas = ordenarPiezas(piezasExpandidas);

  const espaciosLibres: EspacioLibre[] = [
    { x: 0, y: 0, ancho: anchoUtil, alto: altoUtil },
  ];
  const colocadas: PiezaColocada[] = [];
  const noColocadas: PiezaBruta[] = [];

  for (const pieza of piezasOrdenadas) {
    const orientaciones = obtenerOrientacionesValidas(
      pieza, permitirRotacion, lamina.ancho, lamina.alto
    );

    let mejor: {
      indice: number;
      anchoInf: number;
      altoInf: number;
      realAncho: number;
      realAlto: number;
    } | null = null;
    let mejorScore = Infinity;

    for (const orient of orientaciones) {
      const anchoInf = orient.ancho + kerf;
      const altoInf = orient.alto + kerf;
      const candidato = encontrarMejorEspacio(anchoInf, altoInf, espaciosLibres);
      if (candidato) {
        const residual = area(
          candidato.espacio.ancho - anchoInf,
          candidato.espacio.alto - altoInf
        );
        if (residual < mejorScore) {
          mejorScore = residual;
          mejor = {
            indice: candidato.indice,
            anchoInf,
            altoInf,
            realAncho: orient.ancho,
            realAlto: orient.alto,
          };
        }
      }
    }

    if (mejor) {
      const colocada = colocarPiezaEnEspacio(
        espaciosLibres,
        mejor.indice,
        mejor.anchoInf,
        mejor.altoInf,
        pieza.id,
        mejor.realAncho,
        mejor.realAlto
      );
      colocadas.push(colocada);
    } else {
      noColocadas.push({ ...pieza, cantidad: 1 });
    }
  }

  // Aplicar márgenes
  for (const p of colocadas) {
    p.x += margenX;
    p.y += margenY;
  }

  const areaLamina = area(lamina.ancho, lamina.alto);
  const areaUsada = colocadas.reduce((sum, p) => sum + area(p.realAncho, p.realAlto), 0);
  const areaDesperdicio = areaLamina - areaUsada;
  const eficiencia = areaLamina > 0 ? (areaUsada / areaLamina) * 100 : 0;

  return {
    colocadas,
    noColocadas,
    eficiencia: Math.round(eficiencia * 100) / 100,
    areaUsadaMm2: areaUsada,
    areaDesperdicioMm2: Math.max(0, areaDesperdicio),
    espaciosLibresFinales: espaciosLibres,
    lamina,
  };
}

// ─── OPTIMIZACIÓN MULTI‑LÁMINA ─────────────────────────
export function optimizarCorteMultiLamina(
  laminasDisponibles: Lamina[],
  piezasOriginales: PiezaBruta[],
  kerf: number = 0,
  permitirRotacion: boolean = true,
  margenX: number = 0,
  margenY: number = 0,
  autoGenerarLaminas: boolean = true
): ResultadoMultiLamina {
  if (kerf < 0) kerf = 0;
  if (margenX < 0) margenX = 0;
  if (margenY < 0) margenY = 0;

  let piezasRestantes = piezasOriginales.map(p => ({ ...p }));
  const resultados: ResultadoPacking[] = [];
  const totalPiezasEntrada = piezasOriginales.reduce((acc, p) => acc + p.cantidad, 0);

  // 1. Usar láminas existentes
  for (const lamina of laminasDisponibles) {
    if (piezasRestantes.length === 0) break;
    const resultado = optimizarCorteLamina(
      lamina, piezasRestantes, kerf, permitirRotacion, margenX, margenY
    );
    if (resultado.colocadas.length > 0) {
      resultados.push(resultado);
      piezasRestantes = resultado.noColocadas;
    }
  }

  // 2. Autogenerar láminas adicionales si hay piezas restantes
  if (piezasRestantes.length > 0 && autoGenerarLaminas && laminasDisponibles.length > 0) {
    const laminaBase = laminasDisponibles[laminasDisponibles.length - 1];
    if (laminaBase.ancho > 0 && laminaBase.alto > 0) {
      let numExtra = resultados.length + 1;

      while (piezasRestantes.length > 0 && numExtra <= MAX_LAMINAS_AUTOGENERADAS) {
        const nueva: Lamina = {
          ...laminaBase,
          id: `Lámina ${numExtra}`,
        };
        const resultado = optimizarCorteLamina(
          nueva, piezasRestantes, kerf, permitirRotacion, margenX, margenY
        );
        if (resultado.colocadas.length === 0) break;
        resultados.push(resultado);
        piezasRestantes = resultado.noColocadas;
        numExtra++;
      }
    }
  }

  // 3. Métricas globales
  let areaComprada = 0;
  let areaUsada = 0;
  let piezasColocadasCount = 0;

  for (const r of resultados) {
    areaComprada += area(r.lamina.ancho, r.lamina.alto);
    areaUsada += r.areaUsadaMm2;
    piezasColocadasCount += r.colocadas.length;
  }

  const areaTotalM2 = areaComprada / 1_000_000;
  const areaUsadaM2 = areaUsada / 1_000_000;
  const areaDesperdicioM2 = Math.max(0, areaTotalM2 - areaUsadaM2);
  const eficienciaGlobal = areaTotalM2 > 0 ? (areaUsadaM2 / areaTotalM2) * 100 : 0;

  return {
    laminasUsadas: resultados,
    noColocadas: piezasRestantes,
    eficienciaGeneral: Math.round(eficienciaGlobal * 100) / 100,
    laminasTotales: resultados.length,
    resumen: {
      totalLaminas: resultados.length,
      eficienciaGlobal: Math.round(eficienciaGlobal * 10) / 10,
      areaTotalM2: Math.round(areaTotalM2 * 100) / 100,
      areaUsadaM2: Math.round(areaUsadaM2 * 100) / 100,
      areaDesperdicioM2: Math.round(areaDesperdicioM2 * 100) / 100,
      piezasColocadas: piezasColocadasCount,
      piezasTotales: totalPiezasEntrada,
    },
  };
}
