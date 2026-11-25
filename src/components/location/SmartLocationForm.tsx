"use client";

import React, { useState, useEffect, useRef } from "react";
import { 
  MapPin, 
  Crosshair, 
  Navigation, 
  AlertTriangle, 
  CheckCircle2, 
  Compass, 
  Info,
  Loader2,
  Search,
  Sparkles,
  Sliders,
  ExternalLink
} from "lucide-react";
import { MosaMap } from "@/components/discovery/MosaMap";
import { haversineDistance, checkNearDuplicates } from "@/lib/location-quality";
import { LocationSource, LocationVerificationStatus } from "@/types";
import { getCountryConfig, GLOBAL_COUNTRY_CONFIGS } from "@/lib/country-address-config";

export const SUPPORTED_COUNTRIES = [
  { code: "RW", name: "Rwanda", flag: "🇷🇼" },
  { code: "BI", name: "Burundi", flag: "🇧🇮" },
  { code: "CD", name: "DR Congo", flag: "🇨🇩" },
  { code: "UG", name: "Uganda", flag: "🇺🇬" },
  { code: "KE", name: "Kenya", flag: "🇰🇪" },
  { code: "TZ", name: "Tanzania", flag: "🇹🇿" },
  { code: "NG", name: "Nigeria", flag: "🇳🇬" },
  { code: "GH", name: "Ghana", flag: "🇬🇭" },
  { code: "ZA", name: "South Africa", flag: "🇿🇦" },
  { code: "AE", name: "United Arab Emirates", flag: "🇦🇪" },
  { code: "GB", name: "United Kingdom", flag: "🇬🇧" },
  { code: "FR", name: "France", flag: "🇫🇷" },
  { code: "DE", name: "Germany", flag: "🇩🇪" },
  { code: "US", name: "United States", flag: "🇺🇸" },
  { code: "CA", name: "Canada", flag: "🇨🇦" },
  { code: "IN", name: "India", flag: "🇮🇳" },
  { code: "OTHER", name: "Other / International", flag: "🌍" },
];

export interface SmartLocationFormData {
  country?: string;
  provinceId?: string;
  province: string;
  districtId?: string;
  district: string;
  sectorId?: string;
  sector: string;
  cellId?: string;
  cell: string;
  village?: string;
  localAreaId?: string;
  nearestLandmark: string;
  streetName?: string;
  nearbyPlace?: string;
  locationDescription: string;
  latitude: number;
  longitude: number;
  locationSource: LocationSource;
  locationAccuracy?: number;
  locationVerificationStatus: LocationVerificationStatus;
  hasConfirmedCoordinates: boolean;
}

interface SmartLocationFormProps {
  initialValues?: Partial<SmartLocationFormData>;
  businessName?: string;
  businessCategory?: string;
  onChange: (data: SmartLocationFormData) => void;
  existingBusinesses?: Array<{ id: string; name: string; latitude: number; longitude: number; category?: string }>;
  errors?: Record<string, string>;
}

export function SmartLocationForm({
  initialValues,
  businessName = "",
  businessCategory,
  onChange,
  existingBusinesses = [],
  errors = {},
}: SmartLocationFormProps) {
  // Geographic hierarchy tree from /api/geo
  const [geoTree, setGeoTree] = useState<any[]>([]);
  const [loadingGeo, setLoadingGeo] = useState(true);

  // Administrative hierarchy states
  const initialCountry = initialValues?.country || "Rwanda";
  const initialConfig = getCountryConfig(initialCountry);

  const [country, setCountry] = useState(initialCountry);
  const currentCountryConfig = getCountryConfig(country);

  const [province, setProvince] = useState(initialValues?.province || (country === "Rwanda" ? "City of Kigali" : ""));
  const [provinceId, setProvinceId] = useState(initialValues?.provinceId || "");
  const [district, setDistrict] = useState(initialValues?.district || (country === "Rwanda" ? "Gasabo" : ""));
  const [districtId, setDistrictId] = useState(initialValues?.districtId || "");
  const [sector, setSector] = useState(initialValues?.sector || (country === "Rwanda" ? "Kacyiru" : ""));
  const [sectorId, setSectorId] = useState(initialValues?.sectorId || "");
  const [cell, setCell] = useState(initialValues?.cell || (country === "Rwanda" ? "Kamutwa" : ""));
  const [cellId, setCellId] = useState(initialValues?.cellId || "");
  const [village, setVillage] = useState(initialValues?.village || "");
  const [localAreaId, setLocalAreaId] = useState(initialValues?.localAreaId || "");

  // Structured human reference points
  const [nearestLandmark, setNearestLandmark] = useState(initialValues?.nearestLandmark || "");
  const [streetName, setStreetName] = useState(initialValues?.streetName || "");
  const [nearbyPlace, setNearbyPlace] = useState(initialValues?.nearbyPlace || "");
  const [locationDescription, setLocationDescription] = useState(initialValues?.locationDescription || "");

  // Machine coordinates & verification metadata (viewing position strictly separated from confirmed coordinates)
  const hasInitialCoords = typeof initialValues?.latitude === "number" && typeof initialValues?.longitude === "number";
  const [hasConfirmedCoordinates, setHasConfirmedCoordinates] = useState<boolean>(hasInitialCoords);
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number }>({
    lat: initialValues?.latitude ?? initialConfig.defaultCenter.lat,
    lng: initialValues?.longitude ?? initialConfig.defaultCenter.lng,
  });
  const [latitude, setLatitude] = useState<number>(initialValues?.latitude ?? initialConfig.defaultCenter.lat);
  const [longitude, setLongitude] = useState<number>(initialValues?.longitude ?? initialConfig.defaultCenter.lng);
  const [locationSource, setLocationSource] = useState<LocationSource>(initialValues?.locationSource || (hasInitialCoords ? "OWNER_REPORTED" : "ADMIN_MANUAL"));
  const [locationAccuracy, setLocationAccuracy] = useState<number | undefined>(initialValues?.locationAccuracy);
  const [locationVerificationStatus, setLocationVerificationStatus] = useState<LocationVerificationStatus>(
    initialValues?.locationVerificationStatus || "UNVERIFIED"
  );

  // Natural Description Geocoding & Interpretation states
  const [searchQuery, setSearchQuery] = useState(
    initialValues?.locationDescription || initialValues?.nearestLandmark || ""
  );
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [estimatedLocation, setEstimatedLocation] = useState<{
    matchedPlace: string;
    confidence: "HIGH" | "MEDIUM" | "LOW";
    source: string;
  } | null>(null);
  const [pinManuallyAdjusted, setPinManuallyAdjusted] = useState(false);
  const [showTechCoords, setShowTechCoords] = useState(false);
  const geocodeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const latestHierarchyRef = useRef<any>(null);

  // GPS acquisition states
  const [isCapturingGps, setIsCapturingGps] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);

  // Helper to sync geocoder hierarchy with geoTree
  const applyGeocodingHierarchy = (
    h: {
      country?: string;
      province?: string;
      district?: string;
      sector?: string;
      cell?: string;
      village?: string;
      streetName?: string;
      nearestLandmark?: string;
    },
    tree: any[]
  ) => {
    // If international or country is not Rwanda, populate native fields directly
    const isRw = (h.country && h.country.toLowerCase() === "rwanda") || (!h.country && country === "Rwanda");
    if (!isRw) {
      if (h.country) setCountry(h.country);
      if (h.province) setProvince(h.province);
      if (h.district) setDistrict(h.district);
      if (h.sector) setSector(h.sector);
      if (h.cell) setCell(h.cell);
      if (h.village) setVillage(h.village);
      if (h.streetName) setStreetName(h.streetName);
      if (h.nearestLandmark) setNearestLandmark(h.nearestLandmark);
      return;
    }

    if (!tree || tree.length === 0) {
      latestHierarchyRef.current = h;
      return;
    }

    // 1. Province matching
    let targetProv: any = null;
    if (h.province) {
      const cleanH = h.province.toLowerCase().replace(/city of|province/g, "").trim();
      targetProv = tree.find((p: any) => {
        const cleanP = p.name.toLowerCase().replace(/city of|province/g, "").trim();
        return cleanP.includes(cleanH) || cleanH.includes(cleanP);
      });
    }
    if (!targetProv) {
      targetProv = tree.find((p: any) => p.name.toLowerCase().includes("kigali")) || tree[0];
    }

    if (targetProv) {
      setProvinceId(targetProv.id);
      setProvince(targetProv.name);

      // 2. District matching
      if (h.district && Array.isArray(targetProv.districts)) {
        const cleanD = h.district.toLowerCase().trim();
        const targetDist = targetProv.districts.find(
          (d: any) => d.name.toLowerCase().trim() === cleanD || d.name.toLowerCase().includes(cleanD)
        );
        if (targetDist) {
          setDistrictId(targetDist.id);
          setDistrict(targetDist.name);

          // 3. Sector matching
          if (h.sector && Array.isArray(targetDist.sectors)) {
            const cleanS = h.sector.toLowerCase().trim();
            const targetSec = targetDist.sectors.find(
              (s: any) => s.name.toLowerCase().trim() === cleanS || s.name.toLowerCase().includes(cleanS)
            );
            if (targetSec) {
              setSectorId(targetSec.id);
              setSector(targetSec.name);

              // 4. Cell matching
              if (h.cell && Array.isArray(targetSec.cells)) {
                const cleanC = h.cell.toLowerCase().trim();
                const targetCell = targetSec.cells.find(
                  (c: any) => c.name.toLowerCase().trim() === cleanC || c.name.toLowerCase().includes(cleanC)
                );
                if (targetCell) {
                  setCellId(targetCell.id);
                  setCell(targetCell.name);
                }
              }
            }
          }
        }
      }
    }

    // 5. Village
    if (h.village) {
      setVillage(h.village);
    }

    // 6. Street name
    if (h.streetName) {
      setStreetName(h.streetName);
    }

    // 7. Nearest landmark
    if (h.nearestLandmark) {
      setNearestLandmark(h.nearestLandmark);
    }
  };

  // Fetch geographic hierarchy on mount
  useEffect(() => {
    fetch("/api/geo?level=tree")
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.provinces)) {
          setGeoTree(data.provinces);

          // If geocoder hierarchy arrived before tree loaded, apply it now
          if (latestHierarchyRef.current) {
            applyGeocodingHierarchy(latestHierarchyRef.current, data.provinces);
            latestHierarchyRef.current = null;
          } else {
            // Auto-select initial province/district/sector IDs if missing
            const kigali = data.provinces.find((p: any) => p.name.includes("Kigali") || p.code === "KIGALI");
            if (kigali && !provinceId) {
              setProvinceId(kigali.id);
              setProvince(kigali.name);
              const gasabo = kigali.districts.find((d: any) => d.name === "Gasabo") || kigali.districts[0];
              if (gasabo) {
                setDistrictId(gasabo.id);
                setDistrict(gasabo.name);
                const kacyiru = gasabo.sectors.find((s: any) => s.name === "Kacyiru") || gasabo.sectors[0];
                if (kacyiru) {
                  setSectorId(kacyiru.id);
                  setSector(kacyiru.name);
                  const kamutwa = kacyiru.cells.find((c: any) => c.name === "Kamutwa") || kacyiru.cells[0];
                  if (kamutwa) {
                    setCellId(kamutwa.id);
                    setCell(kamutwa.name);
                  }
                }
              }
            }
          }
        }
      })
      .catch((err) => console.warn("[SmartLocationForm] Geo load error:", err))
      .finally(() => setLoadingGeo(false));
  }, []);

  // Compute available districts for selected province
  const currentProvinceObj = geoTree.find((p) => p.id === provinceId || p.name === province);
  const availableDistricts = currentProvinceObj?.districts || [];

  // Compute available sectors for selected district
  const currentDistrictObj = availableDistricts.find((d: any) => d.id === districtId || d.name === district);
  const availableSectors = currentDistrictObj?.sectors || [];

  // Compute available cells for selected sector
  const currentSectorObj = availableSectors.find((s: any) => s.id === sectorId || s.name === sector);
  const availableCells = currentSectorObj?.cells || [];

  // Compute available local areas for selected cell/sector
  const currentCellObj = availableCells.find((c: any) => c.id === cellId || c.name === cell);
  const availableLocalAreas = currentCellObj?.localAreas || [];

  // Cascade handlers
  const handleCountryChange = (selectedCountryName: string) => {
    setCountry(selectedCountryName);
    const cfg = getCountryConfig(selectedCountryName);

    // Update map camera viewing position to target country hub — coordinates are UNCONFIRMED until user specifies location
    setMapCenter(cfg.defaultCenter);
    setHasConfirmedCoordinates(false);
    setLatitude(cfg.defaultCenter.lat);
    setLongitude(cfg.defaultCenter.lng);
    setEstimatedLocation(null);
    setPinManuallyAdjusted(false);
    setLocationVerificationStatus("UNVERIFIED");

    if (selectedCountryName === "Rwanda") {
      const p = geoTree.find((item) => item.name.includes("Kigali")) || geoTree[0];
      if (p) {
        setProvinceId(p.id);
        setProvince(p.name);
        const firstDist = p.districts?.find((d: any) => d.name === "Gasabo") || p.districts?.[0];
        if (firstDist) {
          setDistrictId(firstDist.id);
          setDistrict(firstDist.name);
          const firstSec = firstDist.sectors?.find((s: any) => s.name === "Kacyiru") || firstDist.sectors?.[0];
          if (firstSec) {
            setSectorId(firstSec.id);
            setSector(firstSec.name);
            const firstCell = firstSec.cells?.find((c: any) => c.name === "Kamutwa") || firstSec.cells?.[0];
            if (firstCell) {
              setCellId(firstCell.id);
              setCell(firstCell.name);
            }
          }
        }
      }
    } else {
      setProvinceId("");
      setDistrictId("");
      setSectorId("");
      setCellId("");
      setLocalAreaId("");
      setProvince("");
      setDistrict("");
      setSector("");
      setCell("");
      setVillage("");
    }
  };

  const handleProvinceChange = (pId: string) => {
    setProvinceId(pId);
    const p = geoTree.find((item) => item.id === pId);
    if (p) {
      setProvince(p.name);
      const firstDist = p.districts[0];
      if (firstDist) {
        setDistrictId(firstDist.id);
        setDistrict(firstDist.name);
        const firstSec = firstDist.sectors[0];
        if (firstSec) {
          setSectorId(firstSec.id);
          setSector(firstSec.name);
          const firstCell = firstSec.cells[0];
          if (firstCell) {
            setCellId(firstCell.id);
            setCell(firstCell.name);
          }
        }
      }
    }
  };

  const handleDistrictChange = (dId: string) => {
    setDistrictId(dId);
    const d = availableDistricts.find((item: any) => item.id === dId);
    if (d) {
      setDistrict(d.name);
      const firstSec = d.sectors[0];
      if (firstSec) {
        setSectorId(firstSec.id);
        setSector(firstSec.name);
        const firstCell = firstSec.cells[0];
        if (firstCell) {
          setCellId(firstCell.id);
          setCell(firstCell.name);
        }
      }
    }
  };

  const handleSectorChange = (sId: string) => {
    setSectorId(sId);
    const s = availableSectors.find((item: any) => item.id === sId);
    if (s) {
      setSector(s.name);
      if (s.latitude && s.longitude) {
        setLatitude(s.latitude);
        setLongitude(s.longitude);
        setMapCenter({ lat: s.latitude, lng: s.longitude });
        setHasConfirmedCoordinates(true);
      }
      const firstCell = s.cells[0];
      if (firstCell) {
        setCellId(firstCell.id);
        setCell(firstCell.name);
      }
    }
  };

  const handleCellChange = (cId: string) => {
    setCellId(cId);
    const c = availableCells.find((item: any) => item.id === cId);
    if (c) {
      setCell(c.name);
      if (c.latitude && c.longitude) {
        setLatitude(c.latitude);
        setLongitude(c.longitude);
        setMapCenter({ lat: c.latitude, lng: c.longitude });
        setHasConfirmedCoordinates(true);
      }
    }
  };

  // Execute Geocoding request against /api/geo/geocode
  const executeGeocode = async (rawQuery: string) => {
    const trimmed = rawQuery.trim();
    if (!trimmed || trimmed.length < 3) return;

    setIsGeocoding(true);
    try {
      const res = await fetch("/api/geo/geocode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: trimmed,
          country,
          context: { country, province, district, sector, cell },
        }),
      });

      const data = await res.json();
      if (data.success && data.result) {
        const { lat, lng, confidence, matchedPlace, source, hierarchy } = data.result;

        // Move map pin and update coordinates automatically in the background
        const cleanLat = Number(lat.toFixed(6));
        const cleanLng = Number(lng.toFixed(6));
        setLatitude(cleanLat);
        setLongitude(cleanLng);
        setMapCenter({ lat: cleanLat, lng: cleanLng });
        setHasConfirmedCoordinates(true);
        setLocationSource("MAP_SELECTION");
        setPinManuallyAdjusted(false);

        // Update estimation banner state
        setEstimatedLocation({
          matchedPlace,
          confidence,
          source,
        });

        // Automatically sync administrative hierarchy if recognized
        if (hierarchy) {
          applyGeocodingHierarchy(hierarchy, geoTree);
        }

        // Also reflect description in the human description field
        if (!locationDescription || locationDescription.length < 5) {
          setLocationDescription(trimmed);
        }
      }
    } catch (err) {
      console.warn("[SmartLocationForm] Geocoding lookup error:", err);
    } finally {
      setIsGeocoding(false);
    }
  };

  // Debounced input change handler
  const handleSearchInputChange = (val: string) => {
    setSearchQuery(val);
    if (geocodeTimeoutRef.current) {
      clearTimeout(geocodeTimeoutRef.current);
    }
    if (val.trim().length >= 4) {
      geocodeTimeoutRef.current = setTimeout(() => {
        executeGeocode(val);
      }, 700);
    }
  };

  // Interactive Map Pin Adjustment (drag or click)
  const handleMapPinAdjust = (coords: { lat: number; lng: number }) => {
    const cleanLat = Number(coords.lat.toFixed(6));
    const cleanLng = Number(coords.lng.toFixed(6));
    setLatitude(cleanLat);
    setLongitude(cleanLng);
    setMapCenter({ lat: cleanLat, lng: cleanLng });
    setHasConfirmedCoordinates(true);
    setLocationSource("MAP_SELECTION");
    setPinManuallyAdjusted(true);
    setLocationVerificationStatus("BUSINESS_CONFIRMED");
  };

  // GPS Location Capture via Browser Geolocation API
  const handleCaptureGps = () => {
    if (!navigator.geolocation) {
      setGpsError("Geolocation is not supported by your browser. Please describe or click on the map.");
      return;
    }

    setIsCapturingGps(true);
    setGpsError(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude: lat, longitude: lng, accuracy } = position.coords;
        const cleanLat = Number(lat.toFixed(6));
        const cleanLng = Number(lng.toFixed(6));
        setLatitude(cleanLat);
        setLongitude(cleanLng);
        setMapCenter({ lat: cleanLat, lng: cleanLng });
        setHasConfirmedCoordinates(true);
        setLocationAccuracy(Math.round(accuracy));
        setLocationSource("GPS_DEVICE");
        setLocationVerificationStatus(accuracy <= 50 ? "AGENT_CAPTURED" : "UNVERIFIED");
        setPinManuallyAdjusted(true);
        setIsCapturingGps(false);
      },
      (error) => {
        setIsCapturingGps(false);
        let msg = "Unable to retrieve GPS coordinates.";
        if (error.code === error.PERMISSION_DENIED) {
          msg = "GPS permission denied. Please describe your location or drag the pin on the map.";
        } else if (error.code === error.TIMEOUT) {
          msg = "GPS acquisition timed out. Please describe your location or click on the map.";
        }
        setGpsError(msg);
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 0,
      }
    );
  };

  // Check near duplicates whenever coordinates or businessName changes
  useEffect(() => {
    if (businessName && existingBusinesses.length > 0) {
      const dup = checkNearDuplicates(
        { lat: latitude, lng: longitude, name: businessName, category: businessCategory },
        existingBusinesses,
        25
      );
      if (dup.isNearDuplicate && dup.matchedBusiness) {
        setDuplicateWarning(
          `Warning: "${dup.matchedBusiness.name}" is already registered within ${dup.distanceMeters}m of these coordinates.`
        );
      } else {
        setDuplicateWarning(null);
      }
    } else {
      setDuplicateWarning(null);
    }
  }, [latitude, longitude, businessName, businessCategory, existingBusinesses]);

  // Propagate all changes upward in background automatically (no user coordinate knowledge needed)
  useEffect(() => {
    onChange({
      country,
      provinceId: provinceId || undefined,
      province,
      districtId: districtId || undefined,
      district,
      sectorId: sectorId || undefined,
      sector,
      cellId: cellId || undefined,
      cell,
      village: village || undefined,
      localAreaId: localAreaId || undefined,
      nearestLandmark,
      streetName: streetName || undefined,
      nearbyPlace: nearbyPlace || undefined,
      locationDescription: locationDescription || searchQuery,
      latitude,
      longitude,
      locationSource,
      locationAccuracy,
      locationVerificationStatus,
      hasConfirmedCoordinates,
    });
  }, [
    country, provinceId, province, districtId, district, sectorId, sector, cellId, cell,
    village, localAreaId, nearestLandmark, streetName, nearbyPlace, locationDescription, searchQuery,
    latitude, longitude, locationSource, locationAccuracy, locationVerificationStatus, hasConfirmedCoordinates
  ]);

  return (
    <div className="space-y-4 text-xs">
      
      {/* 1. Natural Ground Description & Auto-Geocoding Engine */}
      <div className="bg-gradient-to-br from-emerald-50/90 via-teal-50/50 to-sky-50/80 p-4 rounded-2xl border border-emerald-200/90 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
          <label htmlFor="smart-location-query" className="font-bold text-slate-900 text-sm flex items-center gap-2">
            <Search className="w-4 h-4 text-emerald-600" />
            <span>Describe Your Location</span>
            <span className="text-[10px] font-semibold uppercase tracking-wider bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full border border-emerald-200">
              Smart Geocoded
            </span>
          </label>
          <span className="text-[11px] text-slate-500">
            Type naturally — the map pin and details update automatically
          </span>
        </div>

        <div className="relative flex items-center">
          <input
            id="smart-location-query"
            type="text"
            value={searchQuery}
            onChange={(e) => handleSearchInputChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                executeGeocode(searchQuery);
              }
            }}
            placeholder={currentCountryConfig.searchPlaceholder}
            className="w-full pl-3.5 pr-28 py-3 rounded-xl border border-emerald-300/80 bg-white text-slate-900 font-medium placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-xs shadow-xs"
          />
          <div className="absolute right-1.5 flex items-center gap-1">
            {isGeocoding ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-100 text-emerald-800 text-[11px] font-medium">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Interpreting...</span>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => executeGeocode(searchQuery)}
                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-[11px] shadow-xs transition-colors flex items-center gap-1 cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5 text-emerald-200" />
                <span>Locate on Map</span>
              </button>
            )}
          </div>
        </div>

        {/* Estimated Location Confirmation Card */}
        {estimatedLocation && (
          <div className="animate-in fade-in slide-in-from-top-1 duration-200">
            {estimatedLocation.confidence === "LOW" ? (
              <div className="bg-amber-50 border border-amber-300 rounded-xl p-3 flex items-start gap-2.5 text-amber-900 shadow-xs">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <div className="font-bold text-xs flex items-center gap-1.5">
                    <span>Location Needs Manual Fine-Tuning</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-200 text-amber-900">
                      Approximate Area
                    </span>
                  </div>
                  <p className="text-[11px] text-amber-800 font-medium">
                    We couldn't pinpoint the exact building from this description. Please drag the pin on the map below or click your location to place the pin manually.
                  </p>
                </div>
              </div>
            ) : (
              <div className="bg-white/95 border border-emerald-300 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-xs">
                <div className="flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900 text-xs">Estimated Location:</span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                        {estimatedLocation.confidence === "HIGH" ? "Exact Landmark Match" : "Recognized Commercial Area"}
                      </span>
                    </div>
                    <p className="text-xs text-slate-800 font-medium mt-0.5">
                      {estimatedLocation.matchedPlace}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Map pin placed and coordinates saved. You can drag the pin on the map below to fine-tune your exact entrance.
                    </p>
                  </div>
                </div>
                {pinManuallyAdjusted && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-[10px] font-semibold shrink-0">
                    <CheckCircle2 className="w-3 h-3 text-amber-600" />
                    Pin Adjusted by You
                  </span>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 2. Interactive Map with Draggable Pin (Automatic Background Coordinate Saving) */}
      <div className="bg-slate-900 text-white p-4 rounded-2xl border border-slate-800 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <div className="font-bold flex items-center gap-1.5 text-sm">
              <Crosshair className="w-4 h-4 text-emerald-400" />
              <span>Interactive Map & Pin Position</span>
            </div>
            <p className="text-[11px] text-slate-400">
              Drag the amber pin or click anywhere on the map to fine-tune your position.
            </p>
          </div>

          {/* GPS Capture Button */}
          <button
            type="button"
            onClick={handleCaptureGps}
            disabled={isCapturingGps}
            className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-2 shadow-md transition-colors cursor-pointer shrink-0"
          >
            {isCapturingGps ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Acquiring GPS...</span>
              </>
            ) : (
              <>
                <Navigation className="w-3.5 h-3.5" />
                <span>Capture GPS Location</span>
              </>
            )}
          </button>
        </div>

        {/* GPS Capture Status Feedback */}
        {locationAccuracy ? (
          <div className="bg-emerald-950/80 border border-emerald-500/40 p-2.5 rounded-xl flex items-center justify-between text-xs text-emerald-300">
            <span className="flex items-center gap-1.5 font-semibold">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>GPS Captured Successfully</span>
            </span>
            <span className="font-mono text-[11px] bg-emerald-900/60 px-2 py-0.5 rounded-md border border-emerald-500/30">
              Accuracy: ±{locationAccuracy} meters ({locationSource})
            </span>
          </div>
        ) : null}

        {gpsError && (
          <div className="bg-amber-950/80 border border-amber-500/40 p-2.5 rounded-xl flex items-start gap-2 text-xs text-amber-300">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <div className="font-bold">GPS Notification</div>
              <div className="text-[11px] text-amber-200/80">{gpsError}</div>
            </div>
          </div>
        )}

        {/* Near Duplicate Alert */}
        {duplicateWarning && (
          <div className="bg-red-950/80 border border-red-500/40 p-2.5 rounded-xl flex items-start gap-2 text-xs text-red-300">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <span>{duplicateWarning}</span>
          </div>
        )}

        {/* Interactive Map with Draggable Pin */}
        <div>
          <MosaMap
            center={mapCenter}
            draggablePin={true}
            draggableCoords={{ lat: latitude, lng: longitude }}
            onCoordinateChange={handleMapPinAdjust}
            accuracyRadiusMeters={locationAccuracy}
            heightClassName="h-60 sm:h-72"
            showDirectionsButton={false}
          />
        </div>

        {/* Background Auto-Save / Confirmation Status Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-slate-800/80 rounded-xl border border-slate-700/60 text-[11px] text-slate-300">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${hasConfirmedCoordinates ? "bg-emerald-400 animate-pulse" : "bg-amber-400"} shrink-0`}></span>
            <span>
              {hasConfirmedCoordinates ? (
                <>
                  {pinManuallyAdjusted ? "Pin manually placed by you" : "Pin placed from description"} —{" "}
                  <strong className="text-emerald-300">Coordinates confirmed</strong>
                </>
              ) : (
                <span className="text-amber-300 font-semibold">
                  Viewing position only ({currentCountryConfig.name}) — Click map or describe address to confirm coordinates.
                </span>
              )}
            </span>
          </div>
          <div className="flex items-center gap-3">
            {!hasConfirmedCoordinates ? (
              <button
                type="button"
                onClick={() => {
                  setHasConfirmedCoordinates(true);
                  setLocationSource("OWNER_REPORTED");
                }}
                className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg text-[10px] flex items-center gap-1 shadow-xs transition-colors cursor-pointer"
              >
                <CheckCircle2 className="w-3 h-3" />
                <span>Confirm Location Pin</span>
              </button>
            ) : (
              <a
                href={`https://www.google.com/maps/@?api=1&map_action=map&center=${latitude},${longitude}&zoom=17`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-emerald-400 hover:text-emerald-300 underline text-[10px] flex items-center gap-1 font-semibold"
                title="Preview location on Google Maps"
              >
                <ExternalLink className="w-3 h-3 text-emerald-400" />
                <span>Google Maps View</span>
              </a>
            )}
            <button
              type="button"
              onClick={() => setShowTechCoords(!showTechCoords)}
              className="text-slate-400 hover:text-white underline text-[10px] flex items-center gap-1 cursor-pointer"
            >
              <Sliders className="w-3 h-3" />
              <span>{showTechCoords ? "Hide details" : "Technical details"}</span>
            </button>
          </div>
        </div>

        {/* Collapsible Technical Details (for advanced users / admins) */}
        {showTechCoords && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs pt-1 border-t border-slate-800 animate-in fade-in duration-150">
            <div>
              <label className="text-slate-400 block mb-1">Latitude (Auto-managed)</label>
              <input
                type="number"
                step="0.000001"
                value={latitude}
                readOnly
                className="w-full p-2 rounded-xl bg-slate-800/90 border border-slate-700 text-slate-300 font-mono text-[11px] cursor-not-allowed"
              />
            </div>
            <div>
              <label className="text-slate-400 block mb-1">Longitude (Auto-managed)</label>
              <input
                type="number"
                step="0.000001"
                value={longitude}
                readOnly
                className="w-full p-2 rounded-xl bg-slate-800/90 border border-slate-700 text-slate-300 font-mono text-[11px] cursor-not-allowed"
              />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className="text-slate-400 block mb-1">Source / Verification</label>
              <div className="p-2 rounded-xl bg-slate-800/90 border border-slate-700 text-emerald-400 font-bold truncate text-[11px]">
                {locationVerificationStatus} ({locationSource})
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 3. Administrative Hierarchy (Universal Country + Region/District/Area) */}
      <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
        <div className="flex items-center justify-between">
          <span className="font-bold text-slate-800 flex items-center gap-1.5">
            <Compass className="w-4 h-4 text-emerald-600" />
            <span>
              {country === "Rwanda" ? "Rwanda Administrative Hierarchy" : `${country} Administrative Location`}
            </span>
          </span>
          <span className="text-[10px] text-slate-400 font-medium">Synced with geocoder</span>
        </div>

        {/* Country Selector */}
        <div>
          <label className="block text-slate-600 font-bold mb-1">
            Country / Region <span className="text-red-500">*</span>
          </label>
          <select
            value={country}
            onChange={(e) => handleCountryChange(e.target.value)}
            className="w-full sm:w-72 p-2 rounded-xl border border-slate-300 bg-white font-medium text-slate-800 outline-none focus:border-emerald-500 cursor-pointer shadow-2xs"
          >
            {SUPPORTED_COUNTRIES.map((c) => (
              <option key={c.code} value={c.name}>
                {c.flag} {c.name}
              </option>
            ))}
          </select>
        </div>

        {country === "Rwanda" ? (
          <>
            {/* Row 1: Province, District */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {/* Province / City */}
              <div>
                <label className="block text-slate-600 font-bold mb-1">
                  Province / City <span className="text-red-500">*</span>
                </label>
                <select
                  value={provinceId}
                  onChange={(e) => handleProvinceChange(e.target.value)}
                  className={`w-full p-2 rounded-xl border font-medium outline-none transition-colors ${
                    errors?.province ? "border-rose-400 bg-rose-50/30 ring-2 ring-rose-200" : "border-slate-300 bg-white"
                  }`}
                >
                  {geoTree.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                {errors?.province && (
                  <span className="text-[11px] text-rose-600 font-bold mt-1 block">{errors.province}</span>
                )}
              </div>

              {/* District */}
              <div>
                <label className="block text-slate-600 font-bold mb-1">
                  District <span className="text-red-500">*</span>
                </label>
                <select
                  value={districtId}
                  onChange={(e) => handleDistrictChange(e.target.value)}
                  className={`w-full p-2 rounded-xl border font-medium outline-none transition-colors ${
                    errors?.district ? "border-rose-400 bg-rose-50/30 ring-2 ring-rose-200" : "border-slate-300 bg-white"
                  }`}
                >
                  {availableDistricts.map((d: any) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
                {errors?.district && (
                  <span className="text-[11px] text-rose-600 font-bold mt-1 block">{errors.district}</span>
                )}
              </div>
            </div>

            {/* Row 2: Sector, Cell, Village */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {/* Sector */}
              <div>
                <label className="block text-slate-600 font-bold mb-1">
                  Sector <span className="text-red-500">*</span>
                </label>
                <select
                  value={sectorId}
                  onChange={(e) => handleSectorChange(e.target.value)}
                  className={`w-full p-2 rounded-xl border font-medium outline-none transition-colors ${
                    errors?.sector ? "border-rose-400 bg-rose-50/30 ring-2 ring-rose-200" : "border-slate-300 bg-white"
                  }`}
                >
                  {availableSectors.map((s: any) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
                {errors?.sector && (
                  <span className="text-[11px] text-rose-600 font-bold mt-1 block">{errors.sector}</span>
                )}
              </div>

              {/* Cell */}
              <div>
                <label className="block text-slate-600 font-bold mb-1">
                  Cell <span className="text-red-500">*</span>
                </label>
                <select
                  value={cellId}
                  onChange={(e) => handleCellChange(e.target.value)}
                  className={`w-full p-2 rounded-xl border font-medium outline-none transition-colors ${
                    errors?.cell ? "border-rose-400 bg-rose-50/30 ring-2 ring-rose-200" : "border-slate-300 bg-white"
                  }`}
                >
                  {availableCells.map((c: any) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                {errors?.cell && (
                  <span className="text-[11px] text-rose-600 font-bold mt-1 block">{errors.cell}</span>
                )}
              </div>

              {/* Village */}
              <div>
                <label className="block text-slate-600 font-bold mb-1">
                  Village <span className="text-slate-400 font-normal">(Umudugudu)</span>
                </label>
                <input
                  type="text"
                  value={village}
                  onChange={(e) => setVillage(e.target.value)}
                  placeholder="e.g. Kamutwa I, Inyange"
                  className="w-full p-2 rounded-xl border border-slate-300 bg-white font-medium focus:border-emerald-500 outline-none"
                />
              </div>
            </div>
          </>
        ) : (
          <>
            {/* Row 1: Native Country Administrative Level 1 & Level 2 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="block text-slate-600 font-bold mb-1">
                  {currentCountryConfig.fieldLabels.level1} <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={province}
                  onChange={(e) => setProvince(e.target.value)}
                  placeholder={currentCountryConfig.levelPlaceholders.level1}
                  className={`w-full p-2 rounded-xl border font-medium outline-none transition-colors ${
                    errors?.province ? "border-rose-400 bg-rose-50/30 ring-2 ring-rose-200" : "border-slate-300 bg-white focus:border-emerald-500"
                  }`}
                />
                {errors?.province && (
                  <span className="text-[11px] text-rose-600 font-bold mt-1 block">{errors.province}</span>
                )}
              </div>
              <div>
                <label className="block text-slate-600 font-bold mb-1">
                  {currentCountryConfig.fieldLabels.level2} <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={district}
                  onChange={(e) => setDistrict(e.target.value)}
                  placeholder={currentCountryConfig.levelPlaceholders.level2}
                  className={`w-full p-2 rounded-xl border font-medium outline-none transition-colors ${
                    errors?.district ? "border-rose-400 bg-rose-50/30 ring-2 ring-rose-200" : "border-slate-300 bg-white focus:border-emerald-500"
                  }`}
                />
                {errors?.district && (
                  <span className="text-[11px] text-rose-600 font-bold mt-1 block">{errors.district}</span>
                )}
              </div>
            </div>

            {/* Row 2: Native Country Level 3, Level 4 & Postal */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div>
                <label className="block text-slate-600 font-bold mb-1">
                  {currentCountryConfig.fieldLabels.level3} <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={sector}
                  onChange={(e) => setSector(e.target.value)}
                  placeholder={currentCountryConfig.levelPlaceholders.level3}
                  className={`w-full p-2 rounded-xl border font-medium outline-none transition-colors ${
                    errors?.sector ? "border-rose-400 bg-rose-50/30 ring-2 ring-rose-200" : "border-slate-300 bg-white focus:border-emerald-500"
                  }`}
                />
                {errors?.sector && (
                  <span className="text-[11px] text-rose-600 font-bold mt-1 block">{errors.sector}</span>
                )}
              </div>
              <div>
                <label className="block text-slate-600 font-bold mb-1">
                  {currentCountryConfig.fieldLabels.level4} <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={cell}
                  onChange={(e) => setCell(e.target.value)}
                  placeholder={currentCountryConfig.levelPlaceholders.level4}
                  className={`w-full p-2 rounded-xl border font-medium outline-none transition-colors ${
                    errors?.cell ? "border-rose-400 bg-rose-50/30 ring-2 ring-rose-200" : "border-slate-300 bg-white focus:border-emerald-500"
                  }`}
                />
                {errors?.cell && (
                  <span className="text-[11px] text-rose-600 font-bold mt-1 block">{errors.cell}</span>
                )}
              </div>
              <div>
                <label className="block text-slate-600 font-bold mb-1">
                  {currentCountryConfig.fieldLabels.postalOrVillage}
                </label>
                <input
                  type="text"
                  value={village}
                  onChange={(e) => setVillage(e.target.value)}
                  placeholder={currentCountryConfig.levelPlaceholders.postalOrVillage}
                  className="w-full p-2 rounded-xl border border-slate-300 bg-white font-medium outline-none focus:border-emerald-500"
                />
              </div>
            </div>
          </>
        )}
      </div>

      {/* 4. Human Ground References (Street / Landmark / Corridor / Notes) */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 space-y-3">
        <span className="font-bold text-slate-800 flex items-center gap-1.5">
          <MapPin className="w-4 h-4 text-emerald-600" />
          <span>Street & Ground References (How Customers Find It)</span>
        </span>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-slate-700 font-bold mb-1">
              Street / Road Name <span className="text-slate-400 font-normal">({currentCountryConfig.streetExample})</span>
            </label>
            <input
              type="text"
              value={streetName}
              onChange={(e) => {
                const val = e.target.value;
                setStreetName(val);
                if (val.trim().length >= 2) setHasConfirmedCoordinates(true);
              }}
              placeholder={currentCountryConfig.streetExample}
              className="w-full p-2.5 rounded-xl border border-slate-300 bg-white font-medium focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="block text-slate-700 font-bold mb-1">
              Nearest Walking Landmark <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={nearestLandmark}
              onChange={(e) => {
                const val = e.target.value;
                setNearestLandmark(val);
                if (val.trim().length >= 2) setHasConfirmedCoordinates(true);
              }}
              placeholder={currentCountryConfig.landmarkExample}
              className={`w-full p-2.5 rounded-xl border font-medium transition-colors ${
                errors?.nearestLandmark
                  ? "border-rose-400 bg-rose-50/30 text-slate-900 ring-2 ring-rose-200"
                  : "border-slate-300 bg-white focus:border-emerald-500"
              }`}
            />
            {errors?.nearestLandmark ? (
              <span className="text-xs text-rose-600 font-bold mt-1 block">
                {errors.nearestLandmark}
              </span>
            ) : (
              <span className="text-[11px] text-slate-500 mt-1 block">
                Crucial for ground discovery: a shop, church, school, or well-known junction nearby.
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-slate-700 font-bold mb-1">Nearby Place / Building</label>
            <input
              type="text"
              value={nearbyPlace}
              onChange={(e) => setNearbyPlace(e.target.value)}
              placeholder="e.g. Opposite Bank of Kigali branch"
              className="w-full p-2.5 rounded-xl border border-slate-300 bg-white"
            />
          </div>

          <div>
            <label className="block text-slate-700 font-bold mb-1">Local Area / Corridor</label>
            {availableLocalAreas.length > 0 ? (
              <select
                value={localAreaId}
                onChange={(e) => setLocalAreaId(e.target.value)}
                className="w-full p-2.5 rounded-xl border border-slate-300 bg-white font-medium"
              >
                <option value="">Select recognized local area...</option>
                {availableLocalAreas.map((la: any) => (
                  <option key={la.id} value={la.id}>{la.name} ({la.type})</option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={cell}
                disabled
                className="w-full p-2.5 rounded-xl border border-slate-200 bg-slate-100 text-slate-500"
              />
            )}
          </div>
        </div>

        <div>
          <label className="block text-slate-700 font-bold mb-1">
            Ground Directions & Micro-Notes <span className="text-slate-400 font-normal">(Helpful for clients & delivery)</span>
          </label>
          <textarea
            value={locationDescription}
            onChange={(e) => {
              const val = e.target.value;
              setLocationDescription(val);
              if (val.trim().length >= 3) setHasConfirmedCoordinates(true);
            }}
            rows={2}
            placeholder="e.g. Opposite the yellow MTN kiosk, 2nd shop after the pharmacy on the left side."
            className="w-full p-2.5 rounded-xl border border-slate-300 bg-white leading-relaxed"
          />
        </div>
      </div>

    </div>
  );
}
