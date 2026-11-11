"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { escapeHtml, getFacilityLabel } from "@/components/facility-display";
import type { Facility } from "@/domain/types";

// Corrigir ícones padrão do Leaflet no Next.js
const defaultIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});
L.Marker.prototype.options.icon = defaultIcon;

interface HealthMapProps {
  center: { lat: number; lng: number };
  facilities: Facility[];
  userLocation: { lat: number; lng: number } | null;
  selectedFacility?: Facility | null;
  onFacilityClick?: (facility: Facility) => void;
}

export default function HealthMap({
  center,
  facilities,
  userLocation,
  selectedFacility,
  onFacilityClick,
}: HealthMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.LayerGroup | null>(null);
  const markerMapRef = useRef<Map<string, L.CircleMarker>>(new Map());

  // Inicializar mapa
  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    const map = L.map(mapRef.current, {
      zoomControl: true,
      attributionControl: true,
    }).setView([center.lat, center.lng], 13);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 18,
    }).addTo(map);

    markersRef.current = L.layerGroup().addTo(map);
    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
      markersRef.current = null;
      markerMapRef.current.clear();
    };
  }, []);

  // Atualizar centro e marcadores
  useEffect(() => {
    const map = mapInstanceRef.current;
    const markers = markersRef.current;
    if (!map || !markers) return;

    map.setView([center.lat, center.lng], map.getZoom());
    markers.clearLayers();
    markerMapRef.current.clear();

    // Marcador do usuário
    if (userLocation) {
      const userMarker = L.circleMarker([userLocation.lat, userLocation.lng], {
        radius: 8,
        fillColor: "#3b82f6",
        color: "#1d4ed8",
        weight: 2,
        fillOpacity: 0.9,
      });
      userMarker.bindPopup("<strong>Sua localização</strong>");
      markers.addLayer(userMarker);
    }

    // Marcadores das unidades de saúde
    const typeColors: Record<string, string> = {
      emergencia: "#ef4444",
      upa: "#f59e0b",
      ubs: "#22c55e",
    };

    for (const facility of facilities) {
      const color = typeColors[facility.type] || "#6b7280";
      const marker = L.circleMarker([facility.lat, facility.lng], {
        radius: 8,
        fillColor: color,
        color: "#fff",
        weight: 2,
        fillOpacity: 0.85,
      });

      // Dados do OSM são de terceiros — SEMPRE escapar antes de montar HTML
      const name = escapeHtml(facility.name);
      const label = escapeHtml(getFacilityLabel(facility.type));
      const address = escapeHtml(facility.address || "Endereço não disponível");
      const phone = escapeHtml(facility.phone || "");

      const popup = `
        <div style="min-width:180px">
          <strong style="font-size:14px">${name}</strong><br/>
          <span style="color:${color};font-weight:600">${label}</span><br/>
          <span style="font-size:12px">${address}</span><br/>
          <span style="font-size:12px"><strong>Distância:</strong> ${facility.distance_km} km</span>
          ${phone ? `<br/><span style="font-size:12px"><strong>Telefone:</strong> ${phone}</span>` : ""}
        </div>
      `;
      marker.bindPopup(popup);

      marker.on("click", () => {
        onFacilityClick?.(facility);
      });

      markers.addLayer(marker);
      markerMapRef.current.set(facility.id, marker);
    }

    // Ajustar bounds se houver facilities e nenhuma unidade selecionada no momento
    if (facilities.length > 0 && !selectedFacility) {
      const bounds = L.latLngBounds(
        facilities.map((f) => [f.lat, f.lng] as [number, number])
      );
      if (userLocation) {
        bounds.extend([userLocation.lat, userLocation.lng]);
      }
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
    }
  }, [center, facilities, userLocation, onFacilityClick]);

  // RF-014: Foco interativo ao selecionar uma unidade na lista lateral
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !selectedFacility) return;

    // Voa suavemente até a unidade
    map.flyTo([selectedFacility.lat, selectedFacility.lng], 15, {
      duration: 0.8,
    });

    // Abre o popup do marcador correspondente
    const marker = markerMapRef.current.get(selectedFacility.id);
    if (marker) {
      marker.openPopup();
    }
  }, [selectedFacility]);

  return (
    <div
      ref={mapRef}
      className="w-full h-full min-h-[350px] rounded-lg border border-border"
      style={{ zIndex: 0 }}
    />
  );
}
