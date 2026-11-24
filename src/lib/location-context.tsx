"use client";

import React, { createContext, useContext, useState, useEffect } from "react";

export interface CommunityOption {
  id: string;
  name: string;
  nameRw?: string;
  sector: string;
  district: string;
  province: string;
  cell?: string;
  localArea?: string;
  isLandmark?: boolean;
  businessCount?: number;
}

export const DEFAULT_COMMUNITIES: CommunityOption[] = [
  {
    id: "nyamirambo-biryogo",
    name: "Biryogo Car-Free Zone, Nyamirambo",
    nameRw: "Biryogo Car-Free Zone, Nyamirambo",
    sector: "Nyamirambo",
    cell: "Biryogo",
    localArea: "Car-Free Zone",
    district: "Nyarugenge",
    province: "Kigali City",
    isLandmark: true,
    businessCount: 24,
  },
  {
    id: "nyamirambo-cosmos",
    name: "Cosmos & Commercial Center, Nyamirambo",
    nameRw: "Cosmos, Nyamirambo",
    sector: "Nyamirambo",
    cell: "Biryogo",
    localArea: "Cosmos",
    district: "Nyarugenge",
    province: "Kigali City",
    businessCount: 18,
  },
  {
    id: "nyamirambo-tapi-rouge",
    name: "Tapi Rouge & Maison des Jeunes, Nyamirambo",
    nameRw: "Tapi Rouge, Nyamirambo",
    sector: "Nyamirambo",
    cell: "Rwezamenyo",
    localArea: "Tapi Rouge",
    district: "Nyarugenge",
    province: "Kigali City",
    businessCount: 14,
  },
  {
    id: "kacyiru-minagri",
    name: "MINAGRI Area (KG 569 St), Kacyiru",
    nameRw: "Ahegereye MINAGRI (KG 569 St), Kacyiru",
    sector: "Kacyiru",
    cell: "Kamutwa",
    localArea: "MINAGRI Area (KG 569 St)",
    district: "Gasabo",
    province: "Kigali City",
    isLandmark: true,
    businessCount: 8,
  },
  {
    id: "musanze-muhoza",
    name: "Musanze Town Center, Muhoza",
    nameRw: "Isoko rya Musanze, Muhoza",
    sector: "Muhoza",
    cell: "Ruhengeri",
    district: "Musanze",
    province: "Northern Province",
    businessCount: 5,
  },
  {
    id: "huye-ngoma",
    name: "Huye University Belt, Ngoma",
    nameRw: "Ahegereye Kaminuza, Ngoma",
    sector: "Ngoma",
    cell: "Matyazo",
    district: "Huye",
    province: "Southern Province",
    businessCount: 4,
  },
  {
    id: "rubavu-gisenyi",
    name: "Gisenyi Border & Lake Market, Rubavu",
    nameRw: "Isoko rya Gisenyi ku Mupaka, Rubavu",
    sector: "Gisenyi",
    cell: "Kivumu",
    district: "Rubavu",
    province: "Western Province",
    businessCount: 6,
  },
  {
    id: "rwamagana-kigabiro",
    name: "Rwamagana Bus Park & Market",
    nameRw: "Gari ya Rwamagana n'Isoko",
    sector: "Kigabiro",
    cell: "Sibagire",
    district: "Rwamagana",
    province: "Eastern Province",
    businessCount: 4,
  },
  {
    id: "bugesera-nyamata",
    name: "Nyamata Town Center, Bugesera",
    nameRw: "Umujyi wa Nyamata",
    sector: "Nyamata",
    cell: "Nyamata Ville",
    district: "Bugesera",
    province: "Eastern Province",
    businessCount: 5,
  },
  {
    id: "muhanga-nyamabuye",
    name: "Muhanga Commercial Crossroads",
    nameRw: "Hagati mu Mujyi wa Muhanga",
    sector: "Nyamabuye",
    cell: "Gitarama",
    district: "Muhanga",
    province: "Southern Province",
    businessCount: 5,
  },
  {
    id: "rusizi-kamembe",
    name: "Kamembe Port & Market, Rusizi",
    nameRw: "Icyambu n'Isoko rya Kamembe",
    sector: "Kamembe",
    cell: "Kamembe",
    district: "Rusizi",
    province: "Western Province",
    businessCount: 4,
  },
  {
    id: "kimironko-market",
    name: "Kimironko Grand Market, Gasabo",
    nameRw: "Isoko rya Kimironko",
    sector: "Kimironko",
    cell: "Bibare",
    district: "Gasabo",
    province: "Kigali City",
    businessCount: 7,
  },
  {
    id: "global-nairobi",
    name: "Westlands Commercial Hub, Nairobi",
    nameRw: "Westlands, Nairobi",
    sector: "Westlands",
    district: "Nairobi",
    province: "Kenya",
    businessCount: 12,
  },
  {
    id: "global-london",
    name: "Shoreditch Artisan District, London",
    nameRw: "Shoreditch, London",
    sector: "Shoreditch",
    district: "Greater London",
    province: "United Kingdom",
    businessCount: 15,
  },
  {
    id: "global-lagos",
    name: "Victoria Island Commercial Zone, Lagos",
    nameRw: "Victoria Island, Lagos",
    sector: "Victoria Island",
    district: "Lagos",
    province: "Nigeria",
    businessCount: 18,
  },
  {
    id: "global-newyork",
    name: "SoHo & Manhattan Retail Hub, New York",
    nameRw: "SoHo, New York",
    sector: "SoHo",
    district: "New York",
    province: "United States",
    businessCount: 20,
  },
];

export interface LocationState {
  currentCountry: string;
  currentCountryCode: string;
  currentCity: string;
  currentSector: string;
  currentCell: string | null;
  currentLocalArea: string | null;
  currentDistrict: string;
  currentProvince: string;
  userCoords: { lat: number; lng: number } | null;
  detectionMethod: "IP" | "GPS" | "MANUAL" | "DEFAULT";
  isLocating: boolean;
  gpsPermissionStatus: "prompt" | "granted" | "denied" | "unsupported";
  isSelectorOpen: boolean;
  displayLabel: string;
  requestGpsLocation: () => Promise<boolean>;
  setCountry: (countryName: string, city?: string) => void;
  setSector: (sector: string, district?: string, province?: string) => void;
  setCell: (cell: string | null) => void;
  setLocalArea: (localArea: string | null) => void;
  setFullLocation: (options: {
    country?: string;
    countryCode?: string;
    city?: string;
    sector?: string;
    district?: string;
    province?: string;
    cell?: string | null;
    localArea?: string | null;
    coords?: { lat: number; lng: number } | null;
    method?: "IP" | "GPS" | "MANUAL";
  }) => void;
  resetLocation: () => void;
  openSelector: () => void;
  closeSelector: () => void;
}

const LocationContext = createContext<LocationState | undefined>(undefined);

const STORAGE_KEY = "mosa_user_community";

export function LocationProvider({ children }: { children: React.ReactNode }) {
  const [currentCountry, setCurrentCountry] = useState<string>("Rwanda");
  const [currentCountryCode, setCurrentCountryCode] = useState<string>("RW");
  const [currentCity, setCurrentCity] = useState<string>("Kigali");
  const [currentSector, setCurrentSector] = useState<string>("all");
  const [currentCell, setCurrentCell] = useState<string | null>(null);
  const [currentLocalArea, setCurrentLocalArea] = useState<string | null>(null);
  const [currentDistrict, setCurrentDistrict] = useState<string>("Worldwide");
  const [currentProvince, setCurrentProvince] = useState<string>("Worldwide");
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [detectionMethod, setDetectionMethod] = useState<"IP" | "GPS" | "MANUAL" | "DEFAULT">("DEFAULT");
  const [isLocating, setIsLocating] = useState<boolean>(false);
  const [gpsPermissionStatus, setGpsPermissionStatus] = useState<"prompt" | "granted" | "denied" | "unsupported">("prompt");
  const [isSelectorOpen, setIsSelectorOpen] = useState<boolean>(false);
  const [customLabel, setCustomLabel] = useState<string | null>(null);

  // Initialize: Load manual preference if saved, or automatically detect visitor location via IP
  useEffect(() => {
    let hasSavedManual = false;
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.method === "MANUAL" || parsed.isExplicit) {
          hasSavedManual = true;
          if (parsed.country) setCurrentCountry(parsed.country);
          if (parsed.countryCode) setCurrentCountryCode(parsed.countryCode);
          if (parsed.city) setCurrentCity(parsed.city);
          if (parsed.sector) setCurrentSector(parsed.sector);
          if (parsed.cell !== undefined) setCurrentCell(parsed.cell);
          if (parsed.localArea !== undefined) setCurrentLocalArea(parsed.localArea);
          if (parsed.district) setCurrentDistrict(parsed.district);
          if (parsed.province) setCurrentProvince(parsed.province);
          if (parsed.coords) setUserCoords(parsed.coords);
          if (parsed.label) setCustomLabel(parsed.label);
          setDetectionMethod("MANUAL");
        }
      }
    } catch {}

    // If no manual preference exists, trigger automatic IP-based detection
    if (!hasSavedManual) {
      fetch("/api/geo/detect")
        .then((res) => res.json())
        .then((data) => {
          if (data.success) {
            setCurrentCountry(data.country || "Rwanda");
            setCurrentCountryCode(data.countryCode || "RW");
            setCurrentCity(data.city || "Kigali");
            setCurrentProvince(data.region || data.country || "Rwanda");
            setCurrentDistrict(data.city || "Worldwide");
            if (data.latitude && data.longitude) {
              setUserCoords({ lat: data.latitude, lng: data.longitude });
            }
            setDetectionMethod("IP");
            setCustomLabel(data.displayLabel || `${data.city}, ${data.country}`);
          }
        })
        .catch((err) => {
          console.warn("[LocationProvider] IP geolocation detection fallback:", err);
        });
    }
  }, []);

  const persist = (data: any) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      // Also write cookie for SSR
      document.cookie = `mosa_location=${encodeURIComponent(JSON.stringify({
        country: data.country,
        city: data.city,
        sector: data.sector
      }))}; path=/; max-age=604800; SameSite=Lax`;
    } catch {}
  };

  const requestGpsLocation = async (): Promise<boolean> => {
    if (typeof window === "undefined" || !navigator.geolocation) {
      setGpsPermissionStatus("unsupported");
      return false;
    }

    setIsLocating(true);

    return new Promise<boolean>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;
          setUserCoords({ lat, lng });
          setGpsPermissionStatus("granted");
          setDetectionMethod("GPS");

          try {
            // Reverse geocode to city and country
            const res = await fetch(`/api/geo/geocode?lat=${lat}&lng=${lng}`);
            if (res.ok) {
              const data = await res.json();
              if (data.success && data.result) {
                const r = data.result;
                setCurrentCountry(r.country);
                setCurrentCountryCode(r.countryCode);
                setCurrentCity(r.city || r.locality);
                setCurrentSector(r.locality || r.city || "all");
                setCustomLabel(r.displayLabel || `${r.city}, ${r.country}`);

                persist({
                  country: r.country,
                  countryCode: r.countryCode,
                  city: r.city,
                  sector: r.locality || r.city,
                  district: r.city,
                  province: r.country,
                  coords: { lat, lng },
                  method: "GPS",
                  label: r.displayLabel,
                  isExplicit: true,
                });
              }
            }
          } catch (e) {
            console.warn("[LocationProvider] Reverse geocoding failed:", e);
          } finally {
            setIsLocating(false);
            resolve(true);
          }
        },
        (error) => {
          console.warn("[LocationProvider] GPS permission denied or unavailable:", error.message);
          setGpsPermissionStatus("denied");
          setIsLocating(false);
          // Graceful fallback: do NOT block discovery, keep IP or default
          resolve(false);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 }
      );
    });
  };

  const setCountry = (countryName: string, city?: string) => {
    const finalCity = city || "All Cities";
    setCurrentCountry(countryName);
    setCurrentCity(finalCity);
    setCurrentSector("all");
    setCurrentCell(null);
    setCurrentLocalArea(null);
    setCurrentDistrict(finalCity);
    setCurrentProvince(countryName);
    setDetectionMethod("MANUAL");
    const label = `${finalCity}, ${countryName}`;
    setCustomLabel(label);
    persist({
      country: countryName,
      city: finalCity,
      sector: "all",
      cell: null,
      localArea: null,
      district: finalCity,
      province: countryName,
      method: "MANUAL",
      label,
      isExplicit: true,
    });
  };

  const setSector = (sector: string, district?: string, province?: string) => {
    const d = district || (sector === "Kacyiru" ? "Gasabo" : sector === "Nyamirambo" ? "Nyarugenge" : currentDistrict);
    const p = province || (d === "Gasabo" || d === "Nyarugenge" ? "Kigali City" : currentProvince);
    setCurrentSector(sector);
    setCurrentCell(null);
    setCurrentLocalArea(null);
    setCurrentDistrict(d);
    setCurrentProvince(p);
    setDetectionMethod("MANUAL");
    setCustomLabel(`${sector}, ${d}`);
    persist({
      country: currentCountry,
      city: currentCity,
      sector,
      cell: null,
      localArea: null,
      district: d,
      province: p,
      method: "MANUAL",
      label: `${sector}, ${d}`,
      isExplicit: true,
    });
  };

  const setCell = (cell: string | null) => {
    setCurrentCell(cell);
    persist({
      country: currentCountry,
      city: currentCity,
      sector: currentSector,
      cell,
      localArea: currentLocalArea,
      district: currentDistrict,
      province: currentProvince,
      method: "MANUAL",
      isExplicit: true,
    });
  };

  const setLocalArea = (localArea: string | null) => {
    setCurrentLocalArea(localArea);
    persist({
      country: currentCountry,
      city: currentCity,
      sector: currentSector,
      cell: currentCell,
      localArea,
      district: currentDistrict,
      province: currentProvince,
      method: "MANUAL",
      isExplicit: true,
    });
  };

  const setFullLocation = (options: {
    country?: string;
    countryCode?: string;
    city?: string;
    sector?: string;
    district?: string;
    province?: string;
    cell?: string | null;
    localArea?: string | null;
    coords?: { lat: number; lng: number } | null;
    method?: "IP" | "GPS" | "MANUAL";
  }) => {
    const c = options.country || currentCountry;
    const cc = options.countryCode || currentCountryCode;
    const city = options.city || currentCity;
    const sec = options.sector || currentSector;
    const d = options.district || currentDistrict;
    const p = options.province || currentProvince;
    const method = options.method || "MANUAL";

    setCurrentCountry(c);
    setCurrentCountryCode(cc);
    setCurrentCity(city);
    setCurrentSector(sec);
    setCurrentDistrict(d);
    setCurrentProvince(p);
    setCurrentCell(options.cell || null);
    setCurrentLocalArea(options.localArea || null);
    if (options.coords) setUserCoords(options.coords);
    setDetectionMethod(method);

    let label = `${city}, ${c}`;
    if (options.localArea) {
      label = `${options.localArea}, ${sec}`;
    } else if (options.cell) {
      label = `${options.cell}, ${sec}`;
    } else if (sec && sec !== "all") {
      label = `${sec}, ${d}`;
    }
    setCustomLabel(label);

    persist({
      country: c,
      countryCode: cc,
      city,
      sector: sec,
      cell: options.cell || null,
      localArea: options.localArea || null,
      district: d,
      province: p,
      coords: options.coords || null,
      method,
      label,
      isExplicit: true,
    });
  };

  const resetLocation = () => {
    setCurrentCountry("Worldwide");
    setCurrentCountryCode("ALL");
    setCurrentCity("Worldwide");
    setCurrentSector("all");
    setCurrentCell(null);
    setCurrentLocalArea(null);
    setCurrentDistrict("Worldwide");
    setCurrentProvince("Worldwide");
    setUserCoords(null);
    setDetectionMethod("MANUAL");
    setCustomLabel("Worldwide (All Locations)");
    persist({
      country: "Worldwide",
      countryCode: "ALL",
      city: "Worldwide",
      sector: "all",
      cell: null,
      localArea: null,
      district: "Worldwide",
      province: "Worldwide",
      coords: null,
      method: "MANUAL",
      label: "Worldwide (All Locations)",
      isExplicit: true,
    });
  };

  // Build human friendly display label
  let displayLabel = customLabel || "Worldwide (All Locations)";
  if (!customLabel) {
    if (currentLocalArea) {
      displayLabel = `${currentLocalArea}, ${currentSector}`;
    } else if (currentCell) {
      displayLabel = `${currentCell}, ${currentSector}`;
    } else if (currentSector && currentSector !== "all") {
      displayLabel = `${currentSector}, ${currentDistrict}`;
    } else if (currentCity && currentCity !== "Worldwide") {
      displayLabel = `${currentCity}, ${currentCountry}`;
    }
  }

  return (
    <LocationContext.Provider
      value={{
        currentCountry,
        currentCountryCode,
        currentCity,
        currentSector,
        currentCell,
        currentLocalArea,
        currentDistrict,
        currentProvince,
        userCoords,
        detectionMethod,
        isLocating,
        gpsPermissionStatus,
        isSelectorOpen,
        displayLabel,
        requestGpsLocation,
        setCountry,
        setSector,
        setCell,
        setLocalArea,
        setFullLocation,
        resetLocation,
        openSelector: () => setIsSelectorOpen(true),
        closeSelector: () => setIsSelectorOpen(false),
      }}
    >
      {children}
    </LocationContext.Provider>
  );
}

export function useLocation() {
  const context = useContext(LocationContext);
  if (!context) {
    throw new Error("useLocation must be used within a LocationProvider");
  }
  return context;
}
