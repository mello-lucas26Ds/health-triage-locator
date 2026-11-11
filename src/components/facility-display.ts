// Apresentação — cores, rótulos e ícones por tipo de unidade.
// Centralizado aqui (camada de apresentação) para reuso entre mapa e lista.

import type { FacilityType } from "@/domain/types";

export function getFacilityColor(type: string): string {
  switch (type as FacilityType) {
    case "emergencia":
      return "#ef4444"; // vermelho
    case "upa":
      return "#f59e0b"; // amarelo
    case "ubs":
      return "#22c55e"; // verde
    default:
      return "#6b7280";
  }
}

export function getFacilityLabel(type: string): string {
  switch (type as FacilityType) {
    case "emergencia":
      return "Emergência / Hospital";
    case "upa":
      return "UPA / SPA";
    case "ubs":
      return "UBS / Policlínica";
    default:
      return "Unidade de Saúde";
  }
}

export function getFacilityIcon(type: string): string {
  switch (type as FacilityType) {
    case "emergencia":
      return "🏥";
    case "upa":
      return "🚑";
    case "ubs":
      return "🏥";
    default:
      return "📍";
  }
}

/**
 * Escapa texto para inserção segura em HTML (popups do Leaflet renderizam HTML).
 * Dados do OpenStreetMap são contribuídos por terceiros — SEMPRE escapar.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
