"use client";

import React, { useState, useRef, useEffect, useMemo } from "react";
import { ChevronDown, Check, Search, Phone } from "lucide-react";
import { GLOBAL_COUNTRY_CONFIGS, CountryAddressConfig } from "@/lib/country-address-config";

export interface InternationalPhoneInputProps {
  id?: string;
  name?: string;
  label?: string;
  value: string;
  onChange: (value: string, fullFormatted: string, countryConfig: CountryAddressConfig) => void;
  country?: string;
  onCountryChange?: (countryName: string, countryConfig: CountryAddressConfig) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  error?: string;
  helperText?: string;
  className?: string;
  size?: "sm" | "md" | "lg";
}

// Convert configs to an array
const COUNTRY_LIST: CountryAddressConfig[] = Object.values(GLOBAL_COUNTRY_CONFIGS);

export function InternationalPhoneInput({
  id,
  name,
  label,
  value,
  onChange,
  country = "Rwanda",
  onCountryChange,
  placeholder,
  required = false,
  disabled = false,
  error,
  helperText,
  className = "",
  size = "md",
}: InternationalPhoneInputProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Active country configuration
  const activeCountry: CountryAddressConfig = useMemo(() => {
    return (
      GLOBAL_COUNTRY_CONFIGS[country] ||
      COUNTRY_LIST.find((c) => c.name.toLowerCase() === country.toLowerCase() || c.code.toLowerCase() === country.toLowerCase()) ||
      GLOBAL_COUNTRY_CONFIGS["Rwanda"]
    );
  }, [country]);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  // Filtered countries for search
  const filteredCountries = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return COUNTRY_LIST;
    return COUNTRY_LIST.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.code.toLowerCase().includes(q) ||
        c.phonePrefix.includes(q)
    );
  }, [searchQuery]);

  // Select country handler
  const handleSelectCountry = (c: CountryAddressConfig) => {
    if (onCountryChange) {
      onCountryChange(c.name, c);
    }
    setIsOpen(false);
    setSearchQuery("");

    // Recalculate formatted with new prefix
    const rawNumber = value.trim();
    let formatted = rawNumber;
    if (rawNumber && !rawNumber.startsWith("+")) {
      const cleanDigits = rawNumber.replace(/^0+/, "");
      formatted = `${c.phonePrefix} ${cleanDigits}`;
    }
    onChange(rawNumber, formatted, c);

    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  // Input change handler with smart prefix detection
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputVal = e.target.value;

    // Smart detection: if user pastes or types a number with another country's prefix (+256, +254, etc.)
    if (inputVal.trim().startsWith("+")) {
      const matched = COUNTRY_LIST.find((c) => inputVal.trim().startsWith(c.phonePrefix));
      if (matched && matched.name !== activeCountry.name) {
        if (onCountryChange) {
          onCountryChange(matched.name, matched);
        }
        onChange(inputVal, inputVal.trim(), matched);
        return;
      }
    }

    // Standard format calculation
    let full = inputVal.trim();
    if (full && !full.startsWith("+")) {
      const cleanDigits = full.replace(/^0+/, "");
      full = `${activeCountry.phonePrefix} ${cleanDigits}`;
    }

    onChange(inputVal, full, activeCountry);
  };

  // Dynamic placeholder based on country
  const resolvedPlaceholder = useMemo(() => {
    if (placeholder) return placeholder;
    switch (activeCountry.code) {
      case "RW":
        return "0788 123 456";
      case "UG":
        return "0701 234 567";
      case "KE":
        return "0712 345 678";
      case "TZ":
        return "0712 345 678";
      case "GB":
        return "07911 123456";
      case "US":
        return "555 123 4567";
      default:
        return `${activeCountry.phonePrefix} 700 000 000`;
    }
  }, [placeholder, activeCountry]);

  return (
    <div className={`space-y-1 ${className}`}>
      {label && (
        <label htmlFor={id} className="block text-xs font-bold text-slate-700 flex items-center justify-between">
          <span>
            {label} {required && <span className="text-rose-600">*</span>}
          </span>
          <span className="text-[11px] font-semibold text-slate-400">
            {activeCountry.name} ({activeCountry.phonePrefix})
          </span>
        </label>
      )}

      {/* Main Input Box */}
      <div
        className={`relative flex items-center w-full rounded-xl border bg-white overflow-visible transition-all shadow-xs ${
          error
            ? "border-rose-400 ring-2 ring-rose-100"
            : "border-slate-300 focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-500/20 hover:border-slate-400"
        } ${disabled ? "opacity-60 bg-slate-50 cursor-not-allowed" : ""}`}
      >
        {/* Country Selector Pill (Distinct, Opaque & Clickable) */}
        <div className="relative shrink-0" ref={dropdownRef}>
          <button
            type="button"
            disabled={disabled}
            onClick={() => setIsOpen(!isOpen)}
            className="flex items-center gap-1.5 px-3 py-2.5 bg-slate-50 hover:bg-slate-100 active:bg-slate-200 border-r border-slate-200 text-xs font-bold text-slate-800 transition-colors cursor-pointer select-none rounded-l-xl focus:outline-none"
            aria-label={`Selected country: ${activeCountry.name} ${activeCountry.phonePrefix}. Click to change.`}
            title={`${activeCountry.name} (${activeCountry.phonePrefix})`}
          >
            <span className="text-base leading-none" role="img" aria-label={activeCountry.name}>
              {activeCountry.flag}
            </span>
            <span className="font-mono text-xs font-bold text-slate-700">
              {activeCountry.phonePrefix}
            </span>
            <ChevronDown
              className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${
                isOpen ? "rotate-180 text-emerald-600" : ""
              }`}
            />
          </button>

          {/* Searchable Country Popover Dropdown */}
          {isOpen && (
            <div className="absolute top-full left-0 mt-1.5 z-50 w-72 max-h-72 bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden flex flex-col p-1.5 animate-in fade-in zoom-in-95 duration-100">
              {/* Country Search Bar */}
              <div className="relative p-1 border-b border-slate-100">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3 pointer-events-none" />
                <input
                  type="text"
                  autoFocus
                  placeholder="Search country or code..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 bg-slate-50 rounded-lg text-xs font-medium text-slate-800 placeholder:text-slate-400 outline-none focus:bg-white focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              {/* Country Items List */}
              <div className="overflow-y-auto max-h-56 divide-y divide-slate-50 pt-1">
                {filteredCountries.length > 0 ? (
                  filteredCountries.map((c) => {
                    const isSelected = c.code === activeCountry.code;
                    return (
                      <button
                        key={c.code}
                        type="button"
                        onClick={() => handleSelectCountry(c)}
                        className={`w-full flex items-center justify-between px-3 py-2 text-left rounded-lg text-xs transition-colors cursor-pointer ${
                          isSelected
                            ? "bg-emerald-50 text-emerald-950 font-bold"
                            : "hover:bg-slate-50 text-slate-700 font-medium"
                        }`}
                      >
                        <div className="flex items-center gap-2.5 truncate">
                          <span className="text-base shrink-0 leading-none">{c.flag}</span>
                          <span className="truncate">{c.name}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="font-mono text-[11px] font-bold text-slate-500">
                            {c.phonePrefix}
                          </span>
                          {isSelected && <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />}
                        </div>
                      </button>
                    );
                  })
                ) : (
                  <div className="p-3 text-center text-xs text-slate-400">
                    No country found matching &ldquo;{searchQuery}&rdquo;
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Clean, Non-Overlapping Input Field */}
        <input
          ref={inputRef}
          id={id}
          name={name}
          type="tel"
          inputMode="tel"
          required={required}
          disabled={disabled}
          autoComplete="tel-national"
          value={value}
          onChange={handleInputChange}
          placeholder={resolvedPlaceholder}
          className="w-full flex-1 px-3.5 py-2.5 bg-white text-sm font-semibold text-slate-900 placeholder:text-slate-400 placeholder:font-normal outline-none rounded-r-xl"
        />
      </div>

      {/* Error / Helper text */}
      {error ? (
        <p className="text-xs text-rose-600 font-semibold mt-1 animate-in fade-in">
          {error}
        </p>
      ) : helperText ? (
        <p className="text-[11px] text-slate-500 mt-1">
          {helperText}
        </p>
      ) : null}
    </div>
  );
}
