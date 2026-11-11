"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { getFacilityColor, getFacilityLabel } from "@/components/facility-display";
import type { ProcessResponse, Facility } from "@/domain/types";
import {
  Heart,
  MapPin,
  Search,
  AlertTriangle,
  Building2,
  Clock,
  Activity,
  ChevronDown,
  ChevronUp,
  Phone,
  Navigation,
  Shield,
  Zap,
  Stethoscope,
} from "lucide-react";

// Dynamic import para evitar SSR do Leaflet
const HealthMap = dynamic(() => import("@/components/HealthMap"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[400px] rounded-lg border border-border bg-muted flex items-center justify-center">
      <div className="text-center space-y-2">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full mx-auto" />
        <p className="text-sm text-muted-foreground">Carregando mapa...</p>
      </div>
    </div>
  ),
});

const EXAMPLES = [
  { text: "69042-110", location: "" },
  { text: "quais unidades de saúde estão perto?", location: "69042-077" },
  { text: "rua juliaca, 10, cidade nova, 69094-060", location: "" },
  { text: "69094-060", location: "" },
  { text: "qual UBS mais proxima?", location: "Alvorada, Manaus" },
  { text: "febre e falta de ar, o que fazer?", location: "Manaus" },
];

/** Rótulo do nível de precisão da geocodificação exibido ao usuário. */
const PRECISION_LABELS: Record<string, string> = {
  coords_exact: "coordenada exata",
  house: "número da rua",
  street: "nível da rua (aprox.)",
  neighborhood: "nível do bairro (aprox.)",
  city: "nível da cidade (aprox.)",
  municipal_centroid: "centróide municipal (impreciso)",
};

export default function Home() {
  const [message, setMessage] = useState("");
  const [location, setLocation] = useState("");
  const [radiusKm, setRadiusKm] = useState(10);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ProcessResponse | null>(null);
  const [error, setError] = useState("");
  const [showMcp, setShowMcp] = useState(false);
  const [selectedFacility, setSelectedFacility] = useState<Facility | null>(null);

  const canSubmit = Boolean(message.trim() || location.trim());

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim() && !location.trim()) return;
    setLoading(true);
    setError("");
    setResult(null);
    setSelectedFacility(null);

    try {
      const resp = await fetch("/api/mcp/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // Mensagem pode ser só localização (CEP/endereço) — o servidor trata.
          message: message.trim() || "unidades de saúde próximas",
          location: location.trim() || undefined,
          radius_km: radiusKm,
        }),
      });

      const data = await resp.json();

      if (!resp.ok) {
        setError(data.error || "Erro ao processar. Verifique sua configuração.");
      } else {
        setResult(data);
      }
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  function handleExampleClick(text: string, loc: string) {
    setMessage(text);
    setLocation(loc);
    // Auto-envia ao clicar no exemplo
    setTimeout(() => {
      const form = document.querySelector('form');
      if (form) form.requestSubmit();
    }, 50);
  }

  const levelColors: Record<string, string> = {
    leve: "bg-green-100 text-green-800 border-green-300",
    moderado: "bg-yellow-100 text-yellow-800 border-yellow-300",
    urgente: "bg-red-100 text-red-800 border-red-300",
  };

  const levelIcons: Record<string, React.ReactNode> = {
    leve: <Heart className="h-5 w-5 text-green-600" />,
    moderado: <AlertTriangle className="h-5 w-5 text-yellow-600" />,
    urgente: <AlertTriangle className="h-5 w-5 text-red-600" />,
  };

  const DEFAULT_CENTER = { lat: -3.1019, lng: -60.0250 };
  const defaultCenter = result?.map_data?.center || DEFAULT_CENTER;

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-slate-50 to-white">
      {/* Header */}
      <header className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-lg bg-emerald-600 flex items-center justify-center">
              <Stethoscope className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900 leading-tight">Health Triage Locator</h1>
              <p className="text-xs text-slate-500">Triagem inteligente com mapa de unidades de saúde</p>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-6 space-y-6">
        {/* Form */}
        <Card className="border-emerald-200 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Shield className="h-5 w-5 text-emerald-600" />
              Descreva sua situação de saúde
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <form onSubmit={handleSubmit} className="space-y-3">
              <Textarea
                placeholder="Ex: estou com tontura e dor de cabeça, devo ir a UBS ou hospital?"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="min-h-[80px] resize-none text-base"
                disabled={loading}
              />
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="flex-1">
                  <Input
                    placeholder="Seu bairro, rua ou CEP (ex: Alvorada, Manaus) — opcional"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    disabled={loading}
                  />
                </div>
                <Button
                  type="submit"
                  disabled={loading || !canSubmit}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white min-w-[140px]"
                >
                  {loading ? (
                    <>
                      <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full mr-2" />
                      Analisando...
                    </>
                  ) : (
                    <>
                      <Search className="h-4 w-4 mr-2" />
                      Analisar
                    </>
                  )}
                </Button>
              </div>
            </form>
            {/* Raio de busca — requisito: unidades a 1–10 km da localização */}
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                Raio de busca:
              </span>
              <input
                type="range"
                min={1}
                max={10}
                step={1}
                value={radiusKm}
                onChange={(e) => setRadiusKm(Number(e.target.value))}
                disabled={loading}
                aria-label="Raio de busca em quilômetros"
                className="flex-1 h-2 accent-emerald-600 cursor-pointer"
              />
              <span className="text-xs font-semibold text-emerald-700 w-12 text-right">
                {radiusKm} km
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <span className="text-xs text-muted-foreground py-1">Exemplos:</span>
              {EXAMPLES.map((ex) => (
                <button
                  key={`${ex.text}|${ex.location}`}
                  onClick={() => handleExampleClick(ex.text, ex.location)}
                  type="button"
                  className="text-xs px-2.5 py-1 rounded-full bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 transition-colors"
                  disabled={loading}
                >
                  {ex.text}
                  {ex.location && (
                    <span className="text-emerald-400"> · {ex.location}</span>
                  )}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Error */}
        {error && (
          <Card className="border-red-200 bg-red-50">
            <CardContent className="py-3 flex items-center gap-2 text-red-700">
              <AlertTriangle className="h-5 w-5 shrink-0" />
              <p className="text-sm">{error}</p>
            </CardContent>
          </Card>
        )}

        {/* Loading skeleton */}
        {loading && !result && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2">
              <Skeleton className="h-[420px] w-full rounded-lg" />
            </div>
            <div className="space-y-4">
              <Skeleton className="h-[120px] w-full rounded-lg" />
              <Skeleton className="h-[200px] w-full rounded-lg" />
            </div>
          </div>
        )}

        {/* Results */}
        {result && (
          <div className="space-y-4">
            {/* Triage Result */}
            <Card className={`border-l-4 ${result.triage.level === "urgente" ? "border-l-red-500" : result.triage.level === "moderado" ? "border-l-yellow-500" : "border-l-green-500"}`}>
              <CardContent className="py-4">
                <div className="flex items-start gap-3">
                  {levelIcons[result.triage.level]}
                  <div className="flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-semibold text-slate-900">Resultado da Triagem</h2>
                      <Badge className={levelColors[result.triage.level]}>
                        {result.triage.level.toUpperCase()}
                      </Badge>
                      <Badge variant="outline">
                        {getFacilityLabel(result.triage.facility_type)}
                      </Badge>
                    </div>
                    <p className="text-sm text-slate-700">{result.triage.recommendation}</p>
                    <p className="text-sm text-slate-600">{result.triage.explanation}</p>
                    {result.triage.warning_signs.length > 0 && (
                      <div className="flex items-start gap-1.5 bg-red-50 rounded-md p-2.5">
                        <AlertTriangle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
                        <div className="text-sm text-red-800">
                          <strong>Sinais de alerta identificados:</strong>{" "}
                          {result.triage.warning_signs.join(", ")}
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {result.latencies.triage_ms}ms
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Map + Sidebar */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Map */}
              <Card className="lg:col-span-2 p-0 overflow-hidden">
                <div className="p-3 border-b bg-white flex items-center justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-emerald-600 shrink-0" />
                      <span className="font-medium text-sm">Mapa de Unidades de Saúde</span>
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">
                        fonte: {result.search_provider}
                      </Badge>
                      {result.location_precision && PRECISION_LABELS[result.location_precision] && (
                        <Badge
                          variant="outline"
                          className={`text-[10px] px-1.5 py-0 shrink-0 ${
                            result.location_precision === "house" || result.location_precision === "coords_exact"
                              ? "text-emerald-700 border-emerald-300"
                              : "text-amber-700 border-amber-300"
                          }`}
                        >
                          precisão: {PRECISION_LABELS[result.location_precision]}
                        </Badge>
                      )}
                    </div>
                    {result.resolved_location && (
                      <p className="text-[11px] text-muted-foreground truncate text-left">
                        Local resolvido: {result.resolved_location}
                      </p>
                    )}
                    {result.location_note && (
                      <p className="text-[10px] text-amber-700 text-left leading-snug">
                        {result.location_note}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-red-500 inline-block" /> Emergência</span>
                    <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-yellow-500 inline-block" /> UPA</span>
                    <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-green-500 inline-block" /> UBS</span>
                  </div>
                </div>
                <div className="h-[420px]">
                  <HealthMap
                    center={defaultCenter}
                    facilities={result.facilities}
                    userLocation={result.map_data?.user_location}
                    selectedFacility={selectedFacility}
                    onFacilityClick={setSelectedFacility}
                  />
                </div>
              </Card>

              {/* Sidebar: Facilities + Latencies */}
              <div className="space-y-4">
                {/* Selected Facility */}
                {selectedFacility && (
                  <Card className="border-blue-200 bg-blue-50/50">
                    <CardContent className="py-3 space-y-1.5">
                      <h3 className="font-semibold text-sm">{selectedFacility.name}</h3>
                      <div className="text-xs text-slate-600 space-y-1">
                        <p className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {selectedFacility.address || "Endereço não disponível"}
                        </p>
                        <p className="flex items-center gap-1">
                          <Navigation className="h-3 w-3" />
                          {selectedFacility.distance_km} km de distância
                        </p>
                        {selectedFacility.phone && (
                          <p className="flex items-center gap-1">
                            <Phone className="h-3 w-3" />
                            {selectedFacility.phone}
                          </p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Facilities List */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-emerald-600" />
                      Unidades Encontradas
                      <Badge variant="secondary" className="ml-auto text-xs">
                        {result.facilities.length}
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="max-h-[280px] overflow-y-auto">
                      {result.facilities.length === 0 ? (
                        <div className="p-4 text-center text-sm text-muted-foreground">
                          {result.search_failed
                            ? "As fontes de busca (Overpass/Nominatim) falharam agora. Tente novamente em instantes."
                            : "Nenhuma unidade encontrada dentro do raio selecionado. Aumente o raio ou refine a localização."}
                        </div>
                      ) : (
                        result.facilities.map((f, i) => (
                          <button
                            key={f.id}
                            onClick={() => setSelectedFacility(f)}
                            className={`w-full text-left px-4 py-2.5 border-b last:border-b-0 hover:bg-slate-50 transition-colors ${
                              selectedFacility?.id === f.id ? "bg-blue-50 border-l-2 border-l-blue-500" : ""
                            }`}
                          >
                            <div className="flex items-start gap-2">
                              <span
                                className="mt-0.5 h-2.5 w-2.5 rounded-full shrink-0"
                                style={{ backgroundColor: getFacilityColor(f.type) }}
                              />
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium truncate">{f.name}</p>
                                <p className="text-xs text-muted-foreground truncate">
                                  {f.address || "Sem endereço"}
                                </p>
                                <div className="flex items-center gap-2 mt-0.5">
                                  <Badge
                                    variant="outline"
                                    className="text-[10px] px-1.5 py-0"
                                    style={{
                                      borderColor: getFacilityColor(f.type),
                                      color: getFacilityColor(f.type),
                                    }}
                                  >
                                    {getFacilityLabel(f.type)}
                                  </Badge>
                                  <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                                    <Navigation className="h-2.5 w-2.5" />
                                    {f.distance_km} km
                                  </span>
                                </div>
                              </div>
                              <span className="text-xs text-muted-foreground shrink-0">#{i + 1}</span>
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Latencies */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Activity className="h-4 w-4 text-emerald-600" />
                      Tempo de Resposta por Etapa
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <LatencyBar label="Classificação de triagem" value={result.latencies.triage_ms} max={5000} />
                    <LatencyBar label="Localização no mapa" value={result.latencies.geocode_ms} max={5000} />
                    <LatencyBar label="Busca de unidades" value={result.latencies.search_ms} max={10000} />
                    <Separator className="my-1" />
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold">Total</span>
                      <span className="text-sm font-bold text-emerald-700">{result.latencies.total_ms} ms</span>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>

            {/* MCP Tool Calls (expandable) */}
            <Card>
              <button
                onClick={() => setShowMcp(!showMcp)}
                className="w-full flex items-center justify-between px-4 py-3 text-left"
              >
                <span className="text-sm font-medium flex items-center gap-2">
                  <Zap className="h-4 w-4 text-amber-500" />
                  Detalhes Técnicos do Pipeline
                  <Badge variant="secondary" className="text-xs">
                    {result.mcp_calls.length} etapas
                  </Badge>
                </span>
                {showMcp ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
              {showMcp && (
                <CardContent className="pt-0 pb-4">
                  <div className="space-y-2">
                    {result.mcp_calls.map((call, i) => (
                      <div
                        key={i}
                        className="border rounded-md p-3 space-y-1.5 bg-slate-50/50"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-mono font-semibold text-slate-700">
                            mcp://{call.tool}
                          </span>
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {call.latency_ms}ms
                          </span>
                        </div>
                        <div className="text-xs text-slate-600">
                          <strong>Entrada:</strong>{" "}
                          <span className="font-mono text-slate-500">
                            {JSON.stringify(call.input).substring(0, 120)}
                          </span>
                        </div>
                        <div className="text-xs text-slate-600">
                          <strong>Resultado:</strong>{" "}
                          <span className="font-mono text-slate-500">
                            {JSON.stringify(call.output).substring(0, 120)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              )}
            </Card>

            {/* Disclaimer */}
            <Card className="bg-amber-50 border-amber-200">
              <CardContent className="py-3">
                <div className="flex items-start gap-2 text-amber-800">
                  <Shield className="h-4 w-4 mt-0.5 shrink-0" />
                  <p className="text-xs leading-relaxed">
                    {result.disclaimer}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 text-center text-xs text-muted-foreground">
          Health Triage Locator — Dados públicos de saúde georreferenciados
        </div>
      </footer>
    </div>
  );
}

function LatencyBar({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = Math.min((value / max) * 100, 100);
  const color = value < 500 ? "bg-green-500" : value < 2000 ? "bg-yellow-500" : "bg-red-500";

  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="text-xs font-mono font-medium">{value.toFixed(0)} ms</span>
      </div>
      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}