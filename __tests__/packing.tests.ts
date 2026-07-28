import { optimizarCorteLamina, optimizarCorteMultiLamina, Lamina, PiezaBruta } from '@/lib/packing';


// --- Datos de prueba comunes ---
const laminaBase: Lamina = {
  id: 1,
  ancho: 1000,
  alto: 1000,
};

const piezaCuadrada: PiezaBruta = {
  id: 'A',
  ancho: 300,
  alto: 300,
  cantidad: 1,
  direccionVeta: 'paralela', // por defecto, aunque no afecta a cuadradas
};

// ==============================
// 1. REGRESIÓN: sin restricciones adicionales
// ==============================
describe('Empaquetado básico', () => {
  test('coloca una pieza correctamente', () => {
    const resultado = optimizarCorteLamina(laminaBase, [piezaCuadrada], 0, false, 0, 0);
    expect(resultado.colocadas).toHaveLength(1);
    expect(resultado.colocadas[0].x).toBe(0);
    expect(resultado.colocadas[0].y).toBe(0);
    expect(resultado.colocadas[0].ancho).toBe(300);
    expect(resultado.colocadas[0].alto).toBe(300);
  });

  test('no cabe una pieza más grande que la lámina', () => {
    const piezaGrande: PiezaBruta = { id: 'B', ancho: 1100, alto: 100, cantidad: 1, direccionVeta: 'paralela' };
    const resultado = optimizarCorteLamina(laminaBase, [piezaGrande], 0, false, 0, 0);
    expect(resultado.colocadas).toHaveLength(0);
  });
});

// ==============================
// 2. KERF (SANGÍA)
// ==============================
describe('Kerf', () => {
  test('con kerf=0 caben 2 piezas, con kerf=50 solo cabe 1', () => {
  const laminaChica: Lamina = { id: 1, ancho: 650, alto: 650 };
  const piezas: PiezaBruta[] = [
    { id: 'C', ancho: 300, alto: 300, cantidad: 2, direccionVeta: 'paralela' },
  ];

  const sinKerf = optimizarCorteLamina(laminaChica, piezas, 0, false, 0, 0);
  expect(sinKerf.colocadas).toHaveLength(2);

  const conKerf = optimizarCorteLamina(laminaChica, piezas, 50, false, 0, 0);
  expect(conKerf.colocadas.length).toBe(1);
});

});

// ==============================
// 3. ROTACIÓN
// ==============================
describe('Rotación', () => {
  test('pieza que no cabe en una orientación se coloca rotada si está permitido', () => {
    const laminaEstrecha: Lamina = { id: 2, ancho: 200, alto: 500 };
    const piezaRectangular: PiezaBruta = {
      id: 'D',
      ancho: 300,
      alto: 100,
      cantidad: 1,
      direccionVeta: 'paralela' // pero no debería impedir rotación porque no hay restricción de veta en la lámina
    };

    const sinRotacion = optimizarCorteLamina(laminaEstrecha, [piezaRectangular], 0, false, 0, 0);
    expect(sinRotacion.colocadas).toHaveLength(0); // no cabe sin rotar

    const conRotacion = optimizarCorteLamina(laminaEstrecha, [piezaRectangular], 0, true, 0, 0);
    expect(conRotacion.colocadas).toHaveLength(1); // sí cabe rotada
    expect(conRotacion.colocadas[0].ancho).toBe(100); // rotada: alto pasa a ancho
    expect(conRotacion.colocadas[0].alto).toBe(300);
  });
});

// ==============================
// 4. DIRECCIÓN DE VETA
// ==============================
describe('Dirección de veta', () => {
  test('pieza con veta paralela no se rota si con eso la veta queda perpendicular a la longitud de la lámina', () => {
    const lamina: Lamina = { id: 3, ancho: 500, alto: 1000 }; // longitud = alto (1000) asumimos que la veta de la lámina va en la longitud
    const pieza: PiezaBruta = {
      id: 'E',
      ancho: 200,
      alto: 300,
      cantidad: 1,
      direccionVeta: 'paralela' // la veta de la pieza debe ir paralela a la longitud de la lámina (alto)
    };

    // Aunque permitirRotacion = true, la pieza NO debe rotarse porque al rotar (300x200) su lado largo (300) quedaría en el ancho,
    // lo que rompería la dirección paralela (la veta iría perpendicular a la longitud).
    const resultado = optimizarCorteLamina(lamina, [pieza], 0, true, 0, 0);
    expect(resultado.colocadas).toHaveLength(1);
    const colocada = resultado.colocadas[0];
    // Debe mantenerse en orientación original: ancho=200, alto=300
    expect(colocada.ancho).toBe(200);
    expect(colocada.alto).toBe(300);
  });

  test('pieza con veta perpendicular se coloca normalmente (puede rotar si la veta lo permite)', () => {
    const lamina: Lamina = { id: 4, ancho: 1000, alto: 1000 };
    const pieza: PiezaBruta = {
      id: 'F',
      ancho: 200,
      alto: 400,
      cantidad: 1,
      direccionVeta: 'perpendicular' // permitiría que la pieza se coloque de cualquier forma, pero la restricción real depende de tu implementación
    };

    const resultado = optimizarCorteLamina(lamina, [pieza], 0, true, 0, 0);
    expect(resultado.colocadas).toHaveLength(1);
    // No verificamos orientación concreta, solo que se haya colocado
  });
});

// ==============================
// 5. MÁRGENES DE SEGURIDAD
// ==============================
describe('Márgenes de seguridad', () => {
  test('con márgenes las piezas se desplazan y el área útil se reduce', () => {
    const lamina: Lamina = { id: 5, ancho: 500, alto: 500 };
    const pieza: PiezaBruta = { id: 'G', ancho: 490, alto: 490, cantidad: 1, direccionVeta: 'paralela' };

    // Sin márgenes cabe
    const sinMargen = optimizarCorteLamina(lamina, [pieza], 0, false, 0, 0);
    expect(sinMargen.colocadas).toHaveLength(1);

    // Con margen de 10 en cada lado, el área útil es 480x480 → no cabe
    const conMargen = optimizarCorteLamina(lamina, [pieza], 0, false, 10, 10);
    expect(conMargen.colocadas).toHaveLength(0);
  });

  test('las coordenadas de colocación incluyen el margen', () => {
    const lamina: Lamina = { id: 6, ancho: 500, alto: 500 };
    const pieza: PiezaBruta = { id: 'H', ancho: 100, alto: 100, cantidad: 1, direccionVeta: 'paralela' };

    const resultado = optimizarCorteLamina(lamina, [pieza], 0, false, 20, 30);
    const colocada = resultado.colocadas[0];
    expect(colocada.x).toBe(20); // desplazado por margenX
    expect(colocada.y).toBe(30); // desplazado por margenY
  });
});

// ==============================
// 6. MÚLTIPLES LÁMINAS
// ==============================
describe('Optimización multi-lámina', () => {
  test('reparte piezas entre varias láminas', () => {
    const laminas: Lamina[] = [
      { id: 10, ancho: 500, alto: 500 },
      { id: 20, ancho: 500, alto: 500 },
      { id: 30, ancho: 500, alto: 500 }, // ¡Tercera lámina agregada para que quepan las 3 piezas!
    ];
    const piezas: PiezaBruta[] = [
      { id: 'P1', ancho: 300, alto: 300, cantidad: 3, direccionVeta: 'paralela' },
    ];

    const resultado = optimizarCorteMultiLamina(laminas, piezas, 0, false, 0, 0);
    
    // CORRECCIÓN: Usamos .laminasUsadas en lugar de .laminas
    expect(resultado.laminasUsadas.length).toBeGreaterThanOrEqual(2);
    
    // CORRECCIÓN: Usamos .laminasUsadas en el reduce también
    const totalColocadas = resultado.laminasUsadas.reduce((sum, lam) => sum + lam.colocadas.length, 0);
    expect(totalColocadas).toBe(3);
  });
});
