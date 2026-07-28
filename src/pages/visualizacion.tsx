import { useState } from "react";
import CorteVisualizer from "@/components/CorteVisualizer";
export default function VisualizacionPage() {
  const [resultado, setResultado] = useState<any>(null);
  const [cargando, setCargando] = useState(false);
  const handleOptimizar = async () => {
    setCargando(true);
    try {
      const response = await fetch("/api/optimizar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          laminas: [
            { id: 1, ancho: 2440, alto: 1220 },
            { id: 2, ancho: 2440, alto: 1220 },
          ],
          piezas: [
            { id: "Estante A", ancho: 600, alto: 400, direccionVeta: "paralela" },
            { id: "Estante B", ancho: 600, alto: 400 },
            { id: "Lateral 1", ancho: 800, alto: 500, direccionVeta: "perpendicular" },
            { id: "Lateral 2", ancho: 800, alto: 500 },
            { id: "Puerta", ancho: 450, alto: 700, direccionVeta: "paralela" },
            { id: "Fondo", ancho: 1200, alto: 600, direccionVeta: "perpendicular" },
          ],
          kerf: 10,
          permitirRotacion: true,
          margenX: 10,
          margenY: 10,
        }),
      });
      const data = await response.json();
      setResultado(data);
    } catch (error) {
      console.error(error);
      alert("Error al optimizar");
    } finally {
      setCargando(false);
    }
  };
  return (
    <div style={{ fontFamily: "sans-serif", padding: "1rem" }}>
      <h1>Prueba del visualizador de cortes</h1>
      <button
        onClick={handleOptimizar}
        disabled={cargando}
        style={{
          padding: "0.75rem 1.5rem",
          fontSize: "1rem",
          marginBottom: "1rem",
          background: "#1a73e8",
          color: "#fff",
          border: "none",
          borderRadius: "4px",
          cursor: "pointer",
        }}
      >
        {cargando ? "Optimizando..." : "Optimizar y Visualizar"}
      </button>
      {resultado && <CorteVisualizer resultado={resultado} />}
    </div>
  );
}
