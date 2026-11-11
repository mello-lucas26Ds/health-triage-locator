// Validação de entradas — borda do sistema (regra de negócio pura).
// Todo payload de API passa por aqui antes de qualquer processamento.

import { z } from "zod";

export const MAX_MESSAGE_LENGTH = 1000;
export const MAX_LOCATION_LENGTH = 200;
/** Raio do fluxo principal (/process): requisito de produto — unidades a 1–10 km. */
export const MIN_PROCESS_RADIUS_KM = 1;
export const MAX_PROCESS_RADIUS_KM = 10;
/** Raio da tool MCP bruta /search-facilities (contrato mais largo para agentes). */
export const MIN_RADIUS_KM = 0.5;
export const MAX_RADIUS_KM = 50;

export const processQuerySchema = z.strictObject({
  message: z
    .string()
    .trim()
    .min(1, "Descreva sua situação de saúde")
    .max(MAX_MESSAGE_LENGTH, `Mensagem muito longa (máx. ${MAX_MESSAGE_LENGTH} caracteres)`),
  location: z
    .string()
    .trim()
    .max(MAX_LOCATION_LENGTH, `Localização muito longa (máx. ${MAX_LOCATION_LENGTH} caracteres)`)
    .optional(),
  radius_km: z
    .number()
    .min(MIN_PROCESS_RADIUS_KM, `Raio mínimo é ${MIN_PROCESS_RADIUS_KM} km`)
    .max(MAX_PROCESS_RADIUS_KM, `Raio máximo é ${MAX_PROCESS_RADIUS_KM} km`)
    .optional(),
  lat: z.number().min(-90, "Latitude inválida").max(90, "Latitude inválida").optional(),
  lng: z.number().min(-180, "Longitude inválida").max(180, "Longitude inválida").optional(),
});

export const searchFacilitiesSchema = z.strictObject({
  lat: z.number().min(-90, "Latitude inválida").max(90, "Latitude inválida"),
  lng: z.number().min(-180, "Longitude inválida").max(180, "Longitude inválida"),
  radius_km: z
    .number()
    .min(MIN_RADIUS_KM, `Raio mínimo é ${MIN_RADIUS_KM} km`)
    .max(MAX_RADIUS_KM, `Raio máximo é ${MAX_RADIUS_KM} km`)
    .default(10),
  types: z.array(z.enum(["ubs", "upa", "emergencia"])).max(3).optional(),
});

export const geocodeSchema = z.strictObject({
  address: z
    .string()
    .trim()
    .min(3, "Informe uma localização mais específica")
    .max(MAX_LOCATION_LENGTH, `Localização muito longa (máx. ${MAX_LOCATION_LENGTH} caracteres)`),
});

export const triageSchema = z.strictObject({
  message: z
    .string()
    .trim()
    .min(1, "Descreva sua situação de saúde")
    .max(MAX_MESSAGE_LENGTH, `Mensagem muito longa (máx. ${MAX_MESSAGE_LENGTH} caracteres)`),
});

export type ProcessQueryInput = z.infer<typeof processQuerySchema>;
export type SearchFacilitiesInput = z.infer<typeof searchFacilitiesSchema>;
export type GeocodeInput = z.infer<typeof geocodeSchema>;
export type TriageInput = z.infer<typeof triageSchema>;

/** Formata erros do zod em uma mensagem única amigável (sem detalhes internos). */
export function formatValidationError(error: z.ZodError): string {
  return error.issues
    .map((issue) => issue.message)
    .filter(Boolean)
    .join(" | ");
}
