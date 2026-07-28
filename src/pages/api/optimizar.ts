import type { NextApiRequest, NextApiResponse } from 'next';
import { optimizarCorteMultiLamina, Lamina, PiezaBruta } from '@/lib/packing';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  try {
    const { laminas, piezas, kerf = 0, permitirRotacion = true, margenX = 0, margenY = 0 } = req.body;

    if (!Array.isArray(laminas) || !Array.isArray(piezas)) {
      return res.status(400).json({ error: 'Formato inválido' });
    }

    const resultado = optimizarCorteMultiLamina(
      laminas as Lamina[],
      piezas as PiezaBruta[],
      kerf,
      permitirRotacion,
      margenX,
      margenY
    );

    return res.status(200).json(resultado);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}
