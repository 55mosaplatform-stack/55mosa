"use client";

import React, { useState, useMemo, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/lib/i18n";
import { processDeviceUpload, isVideoMedia } from "@/lib/media-upload";
import { SmartLocationForm, SmartLocationFormData } from "@/components/location/SmartLocationForm";
import { getCountryConfig } from "@/lib/country-address-config";
import { InternationalPhoneInput } from "@/components/common/InternationalPhoneInput";
import { 
  Store, 
  MapPin, 
  Tag, 
  Phone, 
  MessageCircle, 
  Lock, 
  User, 
  CheckCircle2, 
  ArrowRight, 
  ArrowLeft, 
  Plus, 
  Trash2, 
  Sparkles, 
  ShieldCheck, 
  AlertCircle,
  Loader2,
  FileCheck,
  Edit3,
  Image as ImageIcon,
  Compass,
  Layers,
  Video,
  FileText,
  Upload,
  Check,
  X,
  Camera,
  Search,
  Mail,
  ShoppingBag,
  Shirt,
  Utensils,
  Wine,
  Hotel,
  Scissors,
  HeartPulse,
  Palette,
  PartyPopper,
  Wrench,
  HardHat,
  Home,
  Truck,
  Briefcase,
  Landmark,
  GraduationCap,
  Cpu,
  Sprout,
  Factory,
  Shield,
  Printer,
  Baby,
  MoreHorizontal,
  Eye,
  EyeOff
} from "lucide-react";
import {
  CANONICAL_TAXONOMY,
  ALL_MAIN_CATEGORIES,
  ALL_SUBCATEGORIES,
  ALL_BUSINESS_TYPES,
  validateCategoryHierarchy,
  formatCategoryClassification,
  getBusinessOperatingModel,
  suggestCategoryFromText,
} from "@/lib/taxonomy";
import { UrubutoStyleCheckout } from "@/components/payments/UrubutoStyleCheckout";

// Category icon registry mapping canonical taxonomy icon strings to Lucide components
const CATEGORY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  ShoppingBag,
  Shirt,
  Utensils,
  Wine,
  Hotel,
  Scissors,
  HeartPulse,
  Palette,
  PartyPopper,
  Wrench,
  HardHat,
  Home,
  Sparkles,
  Truck,
  Briefcase,
  Landmark,
  GraduationCap,
  Cpu,
  Sprout,
  Factory,
  Shield,
  Printer,
  Baby,
  MoreHorizontal,
};

const SUGGESTED_SECONDARY_ACTIVITIES = [
  { id: "delivery", label: "Home Delivery", labelRw: "Kugeza ku Bakiriya (Delivery)", icon: "🚚" },
  { id: "wholesale", label: "Wholesale & Bulk Orders", labelRw: "Kugurisha Byinshi (Jumla / Bulk)", icon: "📦" },
  { id: "online_orders", label: "WhatsApp & Online Orders", labelRw: "Kugura kuri WhatsApp / Murandasi", icon: "💬" },
  { id: "mobile_money", label: "Mobile Money & Agency Banking", labelRw: "MoMo / Airtel Money / Ibyicaro bya Banki", icon: "💳" },
  { id: "repairs", label: "Repairs & Maintenance", labelRw: "Gusana & Guhuza Ibikoresho", icon: "🛠️" },
  { id: "custom_orders", label: "Custom / Bespoke Orders", labelRw: "Gukora ku Byifuzo by'Umukiriya", icon: "✨" },
  { id: "catering", label: "Catering & Event Rental", labelRw: "Amafunguro y'Ibirori & Gukodesha", icon: "🍽️" },
  { id: "consultancy", label: "Consultancy & Advisory", labelRw: "Inama z'Inzobere", icon: "📑" },
  { id: "printing", label: "Printing & Photocopying", labelRw: "Gucapa & Fotokopi", icon: "🖨️" },
  { id: "training", label: "Training & Workshops", labelRw: "Amahugurwa n'Ubumenyingiro", icon: "🎓" },
];

const CURRENCY_OPTIONS = [
  { code: "RWF", label: "RWF - Rwandan Franc", symbol: "Frw" },
  { code: "USD", label: "USD - US Dollar ($)", symbol: "$" },
  { code: "EUR", label: "EUR - Euro (€)", symbol: "€" },
  { code: "GBP", label: "GBP - British Pound (£)", symbol: "£" },
  { code: "KES", label: "KES - Kenyan Shilling", symbol: "KSh" },
  { code: "UGX", label: "UGX - Ugandan Shilling", symbol: "USh" },
  { code: "TZS", label: "TZS - Tanzanian Shilling", symbol: "TSh" },
  { code: "NGN", label: "NGN - Nigerian Naira (₦)", symbol: "₦" },
  { code: "ZAR", label: "ZAR - South African Rand", symbol: "R" },
  { code: "GHS", label: "GHS - Ghanaian Cedi (₵)", symbol: "₵" },
  { code: "CAD", label: "CAD - Canadian Dollar ($)", symbol: "CA$" },
  { code: "AED", label: "AED - UAE Dirham", symbol: "AED" },
  { code: "CNY", label: "CNY - Chinese Yuan (¥)", symbol: "¥" },
];

export default function RegisterBusinessPage() {
  const router = useRouter();
  const { lang, t } = useLanguage();

  const getTaxonomyLabel = (item: { name: string; nameRw?: string; nameFr?: string; nameSw?: string } | null | undefined) => {
    if (!item) return "";
    if (lang === "rw" && item.nameRw) return item.nameRw;
    if (lang === "fr" && item.nameFr) return item.nameFr;
    if (lang === "sw" && item.nameSw) return item.nameSw;
    return item.name;
  };

  // 5 Progressive Registration Sections:
  // 1: Business Identity
  // 2: Country & Location
  // 3: Contact & Ownership
  // 4: Business Presentation
  // 5: Review & Submit (with Instant Activation / Receipt checkout)
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [showPassword, setShowPassword] = useState(false);

  // Step 5 Registration Payment & Instant Activation states
  const [registeredBusinessId, setRegisteredBusinessId] = useState<string | null>(null);
  const [registeredBusinessName, setRegisteredBusinessName] = useState<string>("");
  const [paymentConfig, setPaymentConfig] = useState<{ fee: any; providers: any[] } | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<string>("AIRTEL_MONEY");
  const [initiatingPayment, setInitiatingPayment] = useState<boolean>(false);
  const [activePayment, setActivePayment] = useState<any>(null);
  const [paymentStatus, setPaymentStatus] = useState<"PENDING" | "CONFIRMED" | "FAILED">("PENDING");
  const [confirmedReceipt, setConfirmedReceipt] = useState<any>(null);
  const [showReceiptModal, setShowReceiptModal] = useState<boolean>(false);
  const [pollingActive, setPollingActive] = useState<boolean>(false);

  // Form State across all sections
  const [formData, setFormData] = useState({
    // Section 1: Business Identity
    name: "",
    nameRw: "",
    mainCategory: "retail_shops",
    subCategory: "food_grocery",
    businessType: "grocery_shop",
    category: "retail_shops",
    customCategoryName: "",
    description: "",
    secondaryActivities: [] as string[],

    // Section 3: Contact & Ownership
    ownerName: "",
    phone: "",
    hasDifferentWhatsapp: false,
    whatsapp: "",
    email: "",
    password: "",

    // Section 4: Business Presentation
    logo: "",
    coverImage: "",

    // Section 5: Certification
    certifyAccurate: false,
  });

  // Category search filter & suggestion state
  const [categorySearchQuery, setCategorySearchQuery] = useState("");
  const [dismissedSuggestion, setDismissedSuggestion] = useState(false);
  const [customActivityInput, setCustomActivityInput] = useState("");
  const [showSecondaryActivities, setShowSecondaryActivities] = useState(false);

  // Media upload refs & states
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  // Section 2: Location Data
  const [locationData, setLocationData] = useState<SmartLocationFormData>({
    country: "Rwanda",
    province: "Kigali City",
    district: "Nyarugenge",
    sector: "Nyarugenge",
    cell: "Kiyovu",
    nearestLandmark: "",
    streetName: "",
    nearbyPlace: "",
    locationDescription: "",
    latitude: -1.9448,
    longitude: 30.0583,
    locationSource: "OWNER_REPORTED",
    locationVerificationStatus: "UNVERIFIED",
    hasConfirmedCoordinates: false,
  });

  const countryConfig = useMemo(() => {
    return getCountryConfig(locationData.country);
  }, [locationData.country]);

  // Dynamic Operating Model
  const operatingModel = useMemo(() => {
    return getBusinessOperatingModel(formData.mainCategory, formData.subCategory, formData.businessType);
  }, [formData.mainCategory, formData.subCategory, formData.businessType]);

  // Smart Category Suggestion from Name & Description
  const categorySuggestion = useMemo(() => {
    if (dismissedSuggestion) return null;
    const combinedText = `${formData.name} ${formData.description}`.trim();
    if (combinedText.length < 3) return null;
    const suggestion = suggestCategoryFromText(combinedText);
    if (!suggestion) return null;
    if (
      formData.mainCategory === suggestion.mainCategory &&
      formData.subCategory === suggestion.subCategory &&
      formData.businessType === suggestion.businessType
    ) {
      return null;
    }
    return suggestion;
  }, [formData.name, formData.description, formData.mainCategory, formData.subCategory, formData.businessType, dismissedSuggestion]);

  // Filtered categories for Category Search
  const filteredCategories = useMemo(() => {
    const q = categorySearchQuery.trim().toLowerCase();
    if (!q) return CANONICAL_TAXONOMY;
    return CANONICAL_TAXONOMY.filter((m) => {
      if (m.name.toLowerCase().includes(q)) return true;
      if (m.nameRw?.toLowerCase().includes(q)) return true;
      if (m.nameFr?.toLowerCase().includes(q)) return true;
      if (m.nameSw?.toLowerCase().includes(q)) return true;
      return m.subcategories.some((sub) => {
        if (sub.name.toLowerCase().includes(q) || sub.nameRw?.toLowerCase().includes(q)) return true;
        return sub.types.some((t) => t.name.toLowerCase().includes(q) || t.nameRw?.toLowerCase().includes(q));
      });
    });
  }, [categorySearchQuery]);

  // Cascading Category Helpers
  const currentMain = useMemo(() => {
    return CANONICAL_TAXONOMY.find((m) => m.id === formData.mainCategory) || CANONICAL_TAXONOMY[0];
  }, [formData.mainCategory]);

  const availableSubcategories = useMemo(() => {
    return currentMain?.subcategories || [];
  }, [currentMain]);

  const currentSub = useMemo(() => {
    return availableSubcategories.find((s) => s.id === formData.subCategory) || availableSubcategories[0];
  }, [availableSubcategories, formData.subCategory]);

  const availableBusinessTypes = useMemo(() => {
    return currentSub?.types || [];
  }, [currentSub]);

  const currentType = useMemo(() => {
    return availableBusinessTypes.find((t) => t.id === formData.businessType) || availableBusinessTypes[0];
  }, [availableBusinessTypes, formData.businessType]);

  const handleMainCategoryChange = (mainId: string) => {
    const mainObj = CANONICAL_TAXONOMY.find((m) => m.id === mainId);
    const firstSub = mainObj?.subcategories[0];
    const firstType = firstSub?.types[0];
    setFormData((prev) => ({
      ...prev,
      mainCategory: mainId,
      category: mainId,
      subCategory: firstSub ? firstSub.id : "",
      businessType: firstType ? firstType.id : "",
    }));
    if (fieldErrors.category) {
      setFieldErrors((prev) => ({ ...prev, category: "" }));
    }
  };

  const handleSubCategoryChange = (subId: string) => {
    const subObj = availableSubcategories.find((s) => s.id === subId);
    const firstType = subObj?.types[0];
    setFormData((prev) => ({
      ...prev,
      subCategory: subId,
      businessType: firstType ? firstType.id : "",
    }));
    if (fieldErrors.category) {
      setFieldErrors((prev) => ({ ...prev, category: "" }));
    }
  };

  const handleBusinessTypeChange = (typeId: string) => {
    setFormData((prev) => ({
      ...prev,
      businessType: typeId,
    }));
    if (fieldErrors.category) {
      setFieldErrors((prev) => ({ ...prev, category: "" }));
    }
  };

  const applyCategorySuggestion = () => {
    if (!categorySuggestion) return;
    setFormData((prev) => ({
      ...prev,
      mainCategory: categorySuggestion.mainCategory,
      category: categorySuggestion.mainCategory,
      subCategory: categorySuggestion.subCategory,
      businessType: categorySuggestion.businessType,
    }));
    setDismissedSuggestion(true);
    if (fieldErrors.category) {
      setFieldErrors((prev) => ({ ...prev, category: "" }));
    }
  };

  const toggleSecondaryActivity = (label: string) => {
    setFormData((prev) => {
      const exists = prev.secondaryActivities.includes(label);
      if (exists) {
        return { ...prev, secondaryActivities: prev.secondaryActivities.filter((a) => a !== label) };
      }
      return { ...prev, secondaryActivities: [...prev.secondaryActivities, label] };
    });
  };

  const addCustomSecondaryActivity = () => {
    const val = customActivityInput.trim();
    if (!val) return;
    if (!formData.secondaryActivities.includes(val)) {
      setFormData((prev) => ({
        ...prev,
        secondaryActivities: [...prev.secondaryActivities, val],
      }));
    }
    setCustomActivityInput("");
  };

  // Section 4: Media uploads
  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setUploadingLogo(true);
      setErrorMsg(null);
      const processed = await processDeviceUpload(file);
      setFormData((prev) => ({ ...prev, logo: processed.url || (processed as any).dataUrl }));
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to process logo image.");
    } finally {
      setUploadingLogo(false);
      if (logoInputRef.current) logoInputRef.current.value = "";
    }
  };

  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setUploadingCover(true);
      setErrorMsg(null);
      const processed = await processDeviceUpload(file);
      setFormData((prev) => ({ ...prev, coverImage: processed.url || (processed as any).dataUrl }));
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to process cover file.");
    } finally {
      setUploadingCover(false);
      if (coverInputRef.current) coverInputRef.current.value = "";
    }
  };

  // Section 4: Showcase Products & Services Catalog
  const [products, setProducts] = useState<Array<{
    id: string;
    name: string;
    nameRw?: string;
    description?: string;
    isService: boolean;
    contactForPrice: boolean;
    price: string;
    priceMin?: string;
    priceMax?: string;
    priceType?: "FIXED" | "RANGE" | "ESTIMATED";
    currency?: string;
    unit?: string;
    mediaUrl?: string;
    mediaType?: "IMAGE" | "VIDEO" | "FILE";
    mediaCaption?: string;
  }>>([]);

  const defaultCurrency = useMemo(() => {
    return countryConfig.currency || "USD";
  }, [countryConfig]);

  // Active item draft form for Section 4
  const [itemDraft, setItemDraft] = useState({
    name: "",
    nameRw: "",
    description: "",
    isService: false,
    contactForPrice: false,
    price: "",
    priceMin: "",
    priceMax: "",
    priceType: "FIXED" as "FIXED" | "RANGE" | "ESTIMATED",
    currency: defaultCurrency,
    unit: "item",
    mediaUrl: "",
    mediaType: "IMAGE" as "IMAGE" | "VIDEO" | "FILE",
    mediaCaption: "",
  });
  const [editingItemIndex, setEditingItemIndex] = useState<number | null>(null);
  const [itemError, setItemError] = useState<string | null>(null);

  const handleItemFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    let detectedType: "IMAGE" | "VIDEO" | "FILE" = "IMAGE";
    if (file.type.startsWith("video/")) {
      detectedType = "VIDEO";
    } else if (file.type.startsWith("image/")) {
      detectedType = "IMAGE";
    } else {
      detectedType = "FILE";
    }

    if (file.size > 15 * 1024 * 1024) {
      setItemError(lang === "rw" ? "Dosiye irarenga 15MB. Hitamo idafite uburemere bwinshi." : "File exceeds 15MB limit. Please choose a smaller file or link a URL.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      setItemDraft((prev) => ({
        ...prev,
        mediaUrl: result,
        mediaType: detectedType,
        // Auto-default caption from item name so user is never blocked
        mediaCaption: prev.mediaCaption || prev.name || "Showcase item",
      }));
      setItemError(null);
    };
    reader.readAsDataURL(file);
  };

  const handleSaveItem = (): boolean => {
    if (!itemDraft.name.trim()) {
      setItemError(lang === "rw" ? "Injiza izina ry'igicuruzwa cyangwa serivisi." : "Please enter the item or service name.");
      return false;
    }

    // Auto-populate caption from item name if missing
    let finalCaption = itemDraft.mediaCaption.trim();
    if (itemDraft.mediaUrl.trim() && !finalCaption) {
      finalCaption = itemDraft.name.trim() || "Showcase item";
    }

    if (!itemDraft.contactForPrice && !itemDraft.price.trim() && itemDraft.priceType !== "RANGE") {
      setItemError(
        lang === "rw"
          ? "Injiza igiciro cyangwa uhitemo 'Baza Igiciro'."
          : "Please enter a price or select 'Contact for price'."
      );
      return false;
    }

    const newItem = {
      id: editingItemIndex !== null ? products[editingItemIndex].id : `reg-prod-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      name: itemDraft.name.trim(),
      nameRw: itemDraft.nameRw.trim() || undefined,
      description: itemDraft.description.trim() || undefined,
      isService: Boolean(itemDraft.isService),
      contactForPrice: Boolean(itemDraft.contactForPrice),
      price: itemDraft.contactForPrice ? "0" : (itemDraft.price.trim() || "0"),
      priceMin: itemDraft.priceMin.trim() || undefined,
      priceMax: itemDraft.priceMax.trim() || undefined,
      priceType: itemDraft.contactForPrice ? "ESTIMATED" : itemDraft.priceType,
      currency: itemDraft.currency || defaultCurrency,
      unit: itemDraft.unit.trim() || (itemDraft.isService ? "service" : "item"),
      mediaUrl: itemDraft.mediaUrl.trim() || undefined,
      mediaType: itemDraft.mediaType,
      mediaCaption: finalCaption || undefined,
    };

    if (editingItemIndex !== null) {
      const updated = [...products];
      updated[editingItemIndex] = newItem;
      setProducts(updated);
      setEditingItemIndex(null);
    } else {
      setProducts([...products, newItem]);
    }

    setItemDraft({
      name: "",
      nameRw: "",
      description: "",
      isService: operatingModel.isServiceDefault,
      contactForPrice: false,
      price: "",
      priceMin: "",
      priceMax: "",
      priceType: "FIXED",
      currency: defaultCurrency,
      unit: operatingModel.model === "SERVICES" ? "service" : "item",
      mediaUrl: "",
      mediaType: "IMAGE",
      mediaCaption: "",
    });
    setItemError(null);
    return true;
  };

  const handleEditItem = (index: number) => {
    const item = products[index];
    setItemDraft({
      name: item.name,
      nameRw: item.nameRw || "",
      description: item.description || "",
      isService: item.isService,
      contactForPrice: item.contactForPrice,
      price: item.price,
      priceMin: item.priceMin || "",
      priceMax: item.priceMax || "",
      priceType: item.priceType || "FIXED",
      currency: item.currency || defaultCurrency,
      unit: item.unit || "item",
      mediaUrl: item.mediaUrl || "",
      mediaType: (item.mediaType || "IMAGE") as "IMAGE" | "VIDEO" | "FILE",
      mediaCaption: item.mediaCaption || "",
    });
    setEditingItemIndex(index);
    setItemError(null);
  };

  const handleRemoveItem = (index: number) => {
    setProducts(products.filter((_, i) => i !== index));
    if (editingItemIndex === index) {
      setEditingItemIndex(null);
      setItemDraft({
        name: "",
        nameRw: "",
        description: "",
        isService: operatingModel.isServiceDefault,
        contactForPrice: false,
        price: "",
        priceMin: "",
        priceMax: "",
        priceType: "FIXED",
        currency: defaultCurrency,
        unit: operatingModel.model === "SERVICES" ? "service" : "item",
        mediaUrl: "",
        mediaType: "IMAGE",
        mediaCaption: "",
      });
    }
  };

  // Format phone number with country prefix if not already present
  const formatPhoneWithCountry = (phoneStr: string, countryPrefix: string = countryConfig.phonePrefix) => {
    const cleaned = phoneStr.trim().replace(/[\s\-\(\)]+/g, "");
    if (!cleaned) return "";
    if (cleaned.startsWith("+")) return cleaned;
    if (cleaned.startsWith("00")) return "+" + cleaned.slice(2);
    const prefixDigits = countryPrefix.replace(/^\+/, "");

    // If user typed the prefix without '+', e.g. '250788123456' or '254712345678'
    if (cleaned.startsWith(prefixDigits)) {
      return "+" + cleaned;
    }

    // Rwanda special handling: standard local 07X or 7X
    if (countryPrefix === "+250") {
      if (/^0(78|79|72|73)\d{7}$/.test(cleaned)) return cleaned;
      if (/^(78|79|72|73)\d{7}$/.test(cleaned)) return "0" + cleaned;
    }

    // If starts with single 0 (national format like 0712345678 or 020...), strip leading 0 and attach prefix
    if (cleaned.startsWith("0")) {
      return countryPrefix + cleaned.slice(1);
    }

    // Otherwise attach prefix
    return countryPrefix + cleaned;
  };

  // Universal phone validator supporting Rwanda local and international E.164 formats worldwide
  const isValidPhoneNumber = (num: string, prefix: string = countryConfig.phonePrefix) => {
    const formatted = formatPhoneWithCountry(num, prefix);
    if (!formatted) return false;
    const cleaned = formatted.replace(/[\s\-\(\)\.]+/g, "");
    // Rwanda formats: 078/079/072/073 or +250...
    if (/^(\+?250)?(78|79|72|73)\d{7}$/.test(cleaned) || /^0(78|79|72|73)\d{7}$/.test(cleaned)) {
      return true;
    }
    // Universal international E.164 format (+ followed by 7 to 15 digits) or general standard digits
    return /^\+?[1-9]\d{6,14}$/.test(cleaned);
  };

  // Section 1 Validation (Business Identity)
  const validateStep1 = () => {
    const errors: Record<string, string> = {};
    if (!formData.name.trim()) {
      errors.name = t.registration.errors.nameRequired;
    }
    const catVal = validateCategoryHierarchy(formData.mainCategory, formData.subCategory, formData.businessType);
    if (!catVal.isValid) {
      errors.category = catVal.error || "Please select a valid 3-tier category hierarchy";
    }
    if (formData.mainCategory === "other_business" && !formData.customCategoryName.trim()) {
      errors.customCategoryName = "Please describe your custom business activity or specialization";
    }

    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      setErrorMsg("Please complete all required fields in Business Identity.");
      return false;
    }
    setErrorMsg(null);
    return true;
  };

  // Section 2 Validation (Country & Location)
  const validateStep2 = () => {
    const errors: Record<string, string> = {};
    const cfg = getCountryConfig(locationData.country);
    if (!locationData.province) errors.province = `${cfg.fieldLabels.level1} is required`;
    if (!locationData.district) errors.district = `${cfg.fieldLabels.level2} is required`;
    if (!locationData.sector) errors.sector = `${cfg.fieldLabels.level3} is required`;
    if (!locationData.cell) errors.cell = `${cfg.fieldLabels.level4} is required`;
    if (!locationData.nearestLandmark || !locationData.nearestLandmark.trim()) {
      errors.nearestLandmark = (t.registration as any)?.errors?.landmarkRequired || "Nearest recognizable landmark is required";
    }
    if (!locationData.hasConfirmedCoordinates) {
      if (
        (locationData.nearestLandmark && locationData.nearestLandmark.trim().length >= 2) ||
        (locationData.locationDescription && locationData.locationDescription.trim().length >= 3) ||
        (locationData.sector && locationData.cell)
      ) {
        locationData.hasConfirmedCoordinates = true;
        setLocationData((prev) => ({ ...prev, hasConfirmedCoordinates: true }));
      } else {
        errors.coordinates = lang === "rw"
          ? "Nyamuneka kanda ku ikarita cyangwa wandike aho mukorera kugira ngo coordinates zizwe neza."
          : "Please confirm your business pin position on the map or describe your location. Country hub viewing position is not a confirmed business location.";
      }
    }

    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      setErrorMsg(
        errors.coordinates ||
        (lang === "rw"
          ? "Nyamuneka hitamo aho mukorera hose kandi wandike ikimenyetso kigaragara cyo ku butaka (Landmark)."
          : `Please specify your ${cfg.fieldLabels.level2.toLowerCase()}, ${cfg.fieldLabels.level3.toLowerCase()}, ${cfg.fieldLabels.level4.toLowerCase()} and confirm your pin position.`)
      );
      return false;
    }
    setErrorMsg(null);
    return true;
  };

  // Section 3 Validation (Contact & Ownership)
  const validateStep3 = () => {
    const errors: Record<string, string> = {};
    if (!formData.ownerName.trim()) {
      errors.ownerName = t.registration.errors.ownerRequired;
    }
    if (!formData.phone.trim()) {
      errors.phone = t.registration.errors.phoneRequired;
    } else if (!isValidPhoneNumber(formData.phone)) {
      errors.phone = `Enter a valid phone number (e.g. ${countryConfig.phonePrefix} 788 123 456)`;
    }
    if (formData.hasDifferentWhatsapp) {
      if (!formData.whatsapp.trim()) {
        errors.whatsapp = "WhatsApp number is required when enabled";
      } else if (!isValidPhoneNumber(formData.whatsapp)) {
        errors.whatsapp = "Enter a valid WhatsApp number";
      }
    }
    if (formData.email && formData.email.trim()) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email.trim())) {
        errors.email = "Please enter a valid email address (e.g. owner@business.com)";
      }
    }
    if (!formData.password || formData.password.length < 6) {
      errors.password = t.registration.errors.passwordMin;
    }

    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      setErrorMsg("Please complete all required fields in Contact & Ownership.");
      return false;
    }
    setErrorMsg(null);
    return true;
  };

  // Section 4 Validation (Business Presentation)
  const validateStep4 = () => {
    // If user has an active draft with name, validate and save
    if (itemDraft.name.trim()) {
      if (itemDraft.mediaUrl.trim() && !itemDraft.mediaCaption.trim()) {
        itemDraft.mediaCaption = itemDraft.name.trim();
      }
      const saved = handleSaveItem();
      if (!saved) {
        setErrorMsg(
          lang === "rw"
            ? "Nyamuneka uzuza igiciro cyangwa uhitemo 'Baza Igiciro' ku kintu uri kwinjiza."
            : "Please specify a price or select 'Contact for price' for the item being drafted."
        );
        return false;
      }
    }

    // Auto-default caption for any product with media if caption is missing
    for (const p of products) {
      if (p.mediaUrl && !p.mediaCaption?.trim()) {
        p.mediaCaption = p.name.trim() || "Storefront item";
      }
    }

    setErrorMsg(null);
    return true;
  };

  // Comprehensive Checklist for Final Submission
  const validationChecklist = useMemo(() => {
    return [
      {
        id: "name",
        label: "Business Name",
        valid: Boolean(formData.name.trim()),
        step: 1,
      },
      {
        id: "category",
        label: "Category Classification",
        valid: Boolean(
          formData.mainCategory && 
          formData.subCategory && 
          formData.businessType &&
          (formData.mainCategory !== "other_business" || formData.customCategoryName.trim())
        ),
        step: 1,
      },
      {
        id: "admin_location",
        label: `${locationData.country || "Rwanda"} Location (${countryConfig.fieldLabels.level2}, ${countryConfig.fieldLabels.level3})`,
        valid: Boolean(locationData.province && locationData.district && locationData.sector && locationData.cell),
        step: 2,
      },
      {
        id: "landmark",
        label: "Nearest Recognizable Landmark",
        valid: Boolean(locationData.nearestLandmark.trim()),
        step: 2,
      },
      {
        id: "pin_confirmed",
        label: "Map Coordinates Confirmed (Not Viewport Hub)",
        valid: Boolean(locationData.hasConfirmedCoordinates || (locationData.nearestLandmark.trim() && locationData.sector)),
        step: 2,
      },
      {
        id: "owner",
        label: "Owner Name & Valid Phone",
        valid: Boolean(formData.ownerName.trim() && isValidPhoneNumber(formData.phone)),
        step: 3,
      },
      {
        id: "whatsapp",
        label: "WhatsApp Contact",
        valid: !formData.hasDifferentWhatsapp || isValidPhoneNumber(formData.whatsapp),
        step: 3,
      },
      {
        id: "password",
        label: "Account Password (min 6 chars)",
        valid: Boolean(formData.password && formData.password.length >= 6),
        step: 3,
      },
      {
        id: "products",
        label: `${operatingModel.stepLabel} & Showcase Presentation`,
        valid: products.every((p) => {
          if (p.name.trim()) return p.contactForPrice || Number(p.price) >= 0;
          return true;
        }),
        step: 4,
      },
    ];
  }, [formData, locationData, products, operatingModel, countryConfig]);

  const isAllValid = useMemo(() => {
    return validationChecklist.every((c) => c.valid);
  }, [validationChecklist]);

  // Payment Polling Effect for post-submission instant activation
  React.useEffect(() => {
    let interval: any;
    if (pollingActive && activePayment?.paymentReference && paymentStatus !== "CONFIRMED") {
      interval = setInterval(async () => {
        try {
          const res = await fetch(`/api/payments/status?reference=${activePayment.paymentReference}`);
          const data = await res.json();
          if (data.success && data.isConfirmed) {
            setPaymentStatus("CONFIRMED");
            setConfirmedReceipt(data.receipt);
            setPollingActive(false);
          }
        } catch {
          // Retry next tick
        }
      }, 3000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [pollingActive, activePayment, paymentStatus]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    if (!isAllValid) {
      const missingItems = validationChecklist.filter((c) => !c.valid).map((c) => c.label);
      setErrorMsg(
        lang === "rw"
          ? `Ubusabe ntiburuzura. Nyamuneka banza wuzuze: ${missingItems.join(", ")}`
          : `Your application is incomplete. Please complete: ${missingItems.join(", ")}`
      );
      window.scrollTo({ top: 400, behavior: "smooth" });
      return;
    }
    if (!formData.certifyAccurate) {
      setErrorMsg(
        lang === "rw"
          ? "Nyamuneka kanda ku kazu ko kwemeza ko amakuru watanze ari ukuri mbere yo kubika."
          : "Please check the certification box below confirming that your business information is accurate."
      );
      return;
    }

    setErrorMsg(null);
    setSubmitting(true);

    try {
      let effectiveProducts = [...products];
      if (itemDraft.name.trim()) {
        effectiveProducts.push({
          id: `reg-prod-${Date.now()}`,
          name: itemDraft.name.trim(),
          nameRw: itemDraft.nameRw.trim() || undefined,
          description: itemDraft.description.trim() || undefined,
          isService: Boolean(itemDraft.isService),
          contactForPrice: Boolean(itemDraft.contactForPrice),
          price: itemDraft.contactForPrice ? "0" : (itemDraft.price.trim() || "0"),
          priceMin: itemDraft.priceMin.trim() || undefined,
          priceMax: itemDraft.priceMax.trim() || undefined,
          priceType: itemDraft.contactForPrice ? "ESTIMATED" : itemDraft.priceType,
          currency: itemDraft.currency || defaultCurrency,
          unit: itemDraft.unit.trim() || (itemDraft.isService ? "service" : "item"),
          mediaUrl: itemDraft.mediaUrl.trim() || undefined,
          mediaType: itemDraft.mediaType,
          mediaCaption: itemDraft.mediaCaption.trim() || itemDraft.name.trim() || "Showcase item",
        });
      }

      // Auto-default any missing captions
      for (const p of effectiveProducts) {
        if (p.mediaUrl && !p.mediaCaption?.trim()) {
          p.mediaCaption = p.name.trim() || "Showcase item";
        }
      }

      const validProducts = effectiveProducts
        .filter((p) => p.name.trim())
        .map((p) => ({
          name: p.name.trim(),
          nameRw: p.nameRw?.trim() || p.name.trim(),
          description: p.description?.trim() || undefined,
          price: p.contactForPrice ? 0 : (Number(p.price) || 0),
          priceMin: p.priceMin ? Number(p.priceMin) : undefined,
          priceMax: p.priceMax ? Number(p.priceMax) : undefined,
          priceType: p.contactForPrice ? "ESTIMATED" : (p.priceType || (p.priceMin && p.priceMax ? "RANGE" : "FIXED")),
          currency: p.currency || defaultCurrency,
          unit: p.unit || (p.isService ? "service" : "item"),
          isService: Boolean(p.isService),
          contactForPrice: Boolean(p.contactForPrice),
          isEstimated: Boolean(p.contactForPrice),
          mediaUrl: p.mediaUrl?.trim() || undefined,
          mediaType: p.mediaType || "IMAGE",
          mediaCaption: p.mediaCaption?.trim() || p.name.trim() || "Showcase item",
        }));

      const formattedPrimaryPhone = formatPhoneWithCountry(formData.phone.trim(), countryConfig.phonePrefix);
      const effectiveWhatsapp = formData.hasDifferentWhatsapp && formData.whatsapp.trim()
        ? formatPhoneWithCountry(formData.whatsapp.trim(), countryConfig.phonePrefix)
        : formattedPrimaryPhone;

      const payload = {
        name: formData.name.trim(),
        nameRw: formData.nameRw.trim() || formData.name.trim(),
        category: formData.mainCategory,
        mainCategory: formData.mainCategory,
        subCategory: formData.subCategory,
        businessType: formData.businessType,
        customCategoryName: formData.mainCategory === "other_business" ? formData.customCategoryName.trim() : undefined,
        secondaryActivities: formData.secondaryActivities,
        description: formData.description.trim(),
        ownerName: formData.ownerName.trim(),
        phone: formattedPrimaryPhone,
        whatsapp: effectiveWhatsapp,
        email: formData.email.trim() || undefined,
        password: formData.password,
        logo: formData.logo.trim() || undefined,
        coverImage: formData.coverImage.trim() || undefined,
        country: locationData.country || "Rwanda",
        province: locationData.province,
        district: locationData.district,
        sector: locationData.sector,
        cell: locationData.cell,
        localArea: locationData.localAreaId,
        nearestLandmark: locationData.nearestLandmark,
        streetName: locationData.streetName,
        nearbyPlace: locationData.nearbyPlace,
        locationDescription: locationData.locationDescription,
        latitude: locationData.latitude,
        longitude: locationData.longitude,
        hasConfirmedCoordinates: Boolean(locationData.hasConfirmedCoordinates),
        locationAccuracy: locationData.locationAccuracy,
        products: validProducts,
      };

      const res = await fetch("/api/businesses/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to submit business application");
      }

      if (typeof window !== "undefined") {
        if (data.user) {
          try {
            localStorage.setItem("mosa_user_session", JSON.stringify(data.user));
          } catch {}
        }

        // Native Device Password Manager Integration
        if ("PasswordCredential" in window && navigator.credentials) {
          try {
            const cred = new (window as any).PasswordCredential({
              id: formattedPrimaryPhone,
              password: formData.password,
              name: formData.ownerName.trim(),
            });
            await navigator.credentials.store(cred);
          } catch {}
        }
      }

      const createdBizId = data.businessId || data.business?.id;
      setRegisteredBusinessId(createdBizId);
      setRegisteredBusinessName(formData.name.trim());

      // Fetch dynamic payment configuration
      let primaryProvider = "AIRTEL_MONEY";
      try {
        const configUrl = `/api/payments/config?businessId=${createdBizId}&category=${encodeURIComponent(formData.category || "")}`;
        const configRes = await fetch(configUrl);
        const configData = await configRes.json();
        if (configData.success) {
          setPaymentConfig(configData);
          if (configData.fee?.isFree) {
            primaryProvider = "ADMIN_WAIVER";
          } else if (configData.providers && configData.providers.length > 0) {
            const airtel = configData.providers.find((p: any) => p.provider === "AIRTEL_MONEY");
            primaryProvider = airtel ? "AIRTEL_MONEY" : configData.providers[0].provider;
          }
          setSelectedProvider(primaryProvider);
        }
      } catch {}

      // Initiate payment or free waiver for the primary provider
      try {
        const initRes = await fetch("/api/payments/initiate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            businessId: createdBizId,
            provider: primaryProvider,
            phoneNumber: formattedPrimaryPhone,
          }),
        });
        const initData = await initRes.json();
        if (initData.success) {
          setActivePayment(initData.payment);
          if (initData.isFree || initData.isAlreadyPaid || initData.payment?.status === "CONFIRMED") {
            setPaymentStatus("CONFIRMED");
            setConfirmedReceipt(initData.receipt);
            setPollingActive(false);
            setShowReceiptModal(true);
          } else {
            setPollingActive(true);
          }
        }
      } catch {}

      setStep(5);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err: any) {
      setErrorMsg(err.message || "An unexpected error occurred. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto space-y-8">
        
        {/* Top Header */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold shadow-xs">
            <Sparkles className="w-3.5 h-3.5" />
            <span>{t.registration.badge}</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
            {t.registration.title}
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 max-w-xl mx-auto">
            {t.registration.subtitle}
          </p>
        </div>

        {/* 5-Section Progressive Progress Tracker */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            
            {/* Step 1: Identity */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setStep(1)}
                className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs cursor-pointer ${
                  step === 1 
                    ? "bg-emerald-600 text-white shadow-md ring-4 ring-emerald-100" 
                    : step > 1 
                    ? "bg-emerald-500 text-white" 
                    : "bg-slate-100 text-slate-500"
                }`}
              >
                {step > 1 ? <CheckCircle2 className="w-4 h-4" /> : "1"}
              </button>
              <span className={`text-xs font-bold hidden sm:inline ${step === 1 ? "text-slate-900" : "text-slate-500"}`}>
                Identity
              </span>
            </div>

            <div className="h-0.5 flex-1 mx-2 bg-slate-200" />

            {/* Step 2: Location */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  if (validateStep1()) setStep(2);
                }}
                className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs cursor-pointer ${
                  step === 2 
                    ? "bg-emerald-600 text-white shadow-md ring-4 ring-emerald-100" 
                    : step > 2 
                    ? "bg-emerald-500 text-white" 
                    : "bg-slate-100 text-slate-500"
                }`}
              >
                {step > 2 ? <CheckCircle2 className="w-4 h-4" /> : "2"}
              </button>
              <span className={`text-xs font-bold hidden sm:inline ${step === 2 ? "text-slate-900" : "text-slate-500"}`}>
                Location
              </span>
            </div>

            <div className="h-0.5 flex-1 mx-2 bg-slate-200" />

            {/* Step 3: Contact & Ownership */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  if (validateStep1() && validateStep2()) setStep(3);
                }}
                className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs cursor-pointer ${
                  step === 3 
                    ? "bg-emerald-600 text-white shadow-md ring-4 ring-emerald-100" 
                    : step > 3 
                    ? "bg-emerald-500 text-white" 
                    : "bg-slate-100 text-slate-500"
                }`}
              >
                {step > 3 ? <CheckCircle2 className="w-4 h-4" /> : "3"}
              </button>
              <span className={`text-xs font-bold hidden sm:inline ${step === 3 ? "text-slate-900" : "text-slate-500"}`}>
                Contact & Owner
              </span>
            </div>

            <div className="h-0.5 flex-1 mx-2 bg-slate-200" />

            {/* Step 4: Presentation & Showcase */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  if (validateStep1() && validateStep2() && validateStep3()) setStep(4);
                }}
                className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs cursor-pointer ${
                  step === 4 
                    ? "bg-emerald-600 text-white shadow-md ring-4 ring-emerald-100" 
                    : step > 4
                    ? "bg-emerald-500 text-white"
                    : "bg-slate-100 text-slate-500"
                }`}
              >
                {step > 4 ? <CheckCircle2 className="w-4 h-4" /> : "4"}
              </button>
              <span className={`text-xs font-bold hidden sm:inline ${step === 4 ? "text-slate-900" : "text-slate-500"}`}>
                Showcase (Optional)
              </span>
            </div>

            <div className="h-0.5 flex-1 mx-2 bg-slate-200" />

            {/* Step 5: Review & Submit */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  if (validateStep1() && validateStep2() && validateStep3()) setStep(5);
                }}
                className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs cursor-pointer ${
                  step === 5
                    ? "bg-emerald-600 text-white shadow-md ring-4 ring-emerald-100" 
                    : "bg-slate-100 text-slate-500"
                }`}
              >
                {paymentStatus === "CONFIRMED" ? <CheckCircle2 className="w-4 h-4" /> : "5"}
              </button>
              <span className={`text-xs font-bold hidden sm:inline ${step === 5 ? "text-slate-900" : "text-slate-500"}`}>
                {registeredBusinessId ? (paymentStatus === "CONFIRMED" ? "Activated" : "Payment") : "Review & Submit"}
              </span>
            </div>

          </div>
        </div>

        {/* Error Alert Box */}
        {errorMsg && (
          <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-3 shadow-xs">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div className="font-semibold">{errorMsg}</div>
          </div>
        )}

        {/* SECTION 1: BUSINESS IDENTITY */}
        {step === 1 && (
          <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-card space-y-6">
            <div className="border-b border-slate-100 pb-4">
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Store className="w-5 h-5 text-emerald-600" />
                <span>Section 1: Business Identity & Category Identification</span>
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Name your business and select the exact commercial category that best represents what you offer to customers worldwide.
              </p>
            </div>

            <div className="space-y-5">
              {/* Business Name (Required) */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  {t.registration.businessNameLabel} <span className="text-rose-600">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder={t.registration.businessNamePlaceholder}
                  value={formData.name}
                  onChange={(e) => {
                    setFormData({ ...formData, name: e.target.value });
                    if (fieldErrors.name) setFieldErrors({ ...fieldErrors, name: "" });
                  }}
                  className={`w-full px-4 py-2.5 rounded-xl border text-sm font-medium outline-none transition-colors ${
                    fieldErrors.name ? "border-rose-400 bg-rose-50/30" : "border-slate-300 focus:border-emerald-500"
                  }`}
                />
                {fieldErrors.name && (
                  <span className="text-xs text-rose-600 font-semibold mt-1 block">
                    {fieldErrors.name}
                  </span>
                )}
              </div>

              {/* Local / Kinyarwanda Name (Optional) */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Local / Kinyarwanda Business Name <span className="text-slate-400 font-normal">(Optional)</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g., Akabari k'Amata ka Biryogo, Ishyuka Arts Kigali"
                  value={formData.nameRw}
                  onChange={(e) => setFormData({ ...formData, nameRw: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 text-sm font-medium focus:border-emerald-500 outline-none"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Business Description <span className="text-slate-400 font-normal">(Optional)</span>
                </label>
                <textarea
                  rows={2}
                  placeholder="Describe your specialties, products, services, or dining experience..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 text-sm font-medium focus:border-emerald-500 outline-none"
                />
              </div>

              {/* Smart Category Suggestion Banner */}
              {categorySuggestion && (
                <div className="p-4 rounded-2xl bg-amber-50/90 border border-amber-200/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
                  <div className="flex items-start gap-2.5">
                    <Sparkles className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <div className="text-xs font-bold text-amber-950">
                        Smart Category Suggestion: <span className="text-emerald-700 font-extrabold">{categorySuggestion.categoryLabel}</span>
                      </div>
                      <p className="text-[11px] text-amber-800/90 mt-0.5">
                        {categorySuggestion.reason}. Would you like to set your category to this?
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                    <button
                      type="button"
                      onClick={applyCategorySuggestion}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs transition cursor-pointer"
                    >
                      Apply Suggestion
                    </button>
                    <button
                      type="button"
                      onClick={() => setDismissedSuggestion(true)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 transition cursor-pointer"
                      title="Dismiss"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}

              {/* Category Selection Section */}
              <div className="p-5 rounded-2xl bg-emerald-50/30 border border-emerald-200/70 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-emerald-200/60 pb-3">
                  <div>
                    <span className="text-xs font-black uppercase tracking-wider text-emerald-950 flex items-center gap-1.5">
                      <Tag className="w-3.5 h-3.5 text-emerald-600" />
                      Business Category Selection <span className="text-rose-600">*</span>
                    </span>
                    <p className="text-[11px] text-emerald-800/80 mt-0.5">
                      Choose from 24 canonical MOSA economic categories or search by keyword.
                    </p>
                  </div>
                  <div className="text-[11px] font-mono font-bold text-emerald-800 bg-white px-2.5 py-1 rounded-lg border border-emerald-200 shrink-0">
                    {formData.mainCategory}
                  </div>
                </div>

                {/* Category Search Filter */}
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                  <input
                    type="text"
                    placeholder="Search 24 business categories (e.g. food, boutique, legal, farm, tech, other)..."
                    value={categorySearchQuery}
                    onChange={(e) => setCategorySearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 rounded-xl bg-white border border-slate-200 text-xs font-semibold focus:border-emerald-500 outline-none"
                  />
                  {categorySearchQuery && (
                    <button
                      type="button"
                      onClick={() => setCategorySearchQuery("")}
                      className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Visual Category Cards Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 max-h-64 overflow-y-auto p-1 border border-slate-200/60 rounded-xl bg-white/70">
                  {filteredCategories.map((cat) => {
                    const isSelected = formData.mainCategory === cat.id;
                    const IconComponent = CATEGORY_ICONS[cat.icon] || Store;
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => handleMainCategoryChange(cat.id)}
                        className={`p-2.5 rounded-xl border text-left transition flex flex-col justify-between gap-1.5 cursor-pointer ${
                          isSelected
                            ? "bg-emerald-50 border-emerald-500 text-emerald-950 ring-2 ring-emerald-500/20 shadow-xs"
                            : "bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/60 text-slate-700"
                        }`}
                      >
                        <div className="flex items-center justify-between w-full">
                          <div className={`p-1.5 rounded-lg ${isSelected ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-600"}`}>
                            <IconComponent className="w-3.5 h-3.5" />
                          </div>
                          {isSelected && <Check className="w-3.5 h-3.5 text-emerald-600" />}
                        </div>
                        <div>
                          <div className="text-[11px] font-bold line-clamp-1">
                            {getTaxonomyLabel(cat)}
                          </div>
                          <div className="text-[9px] text-slate-500 font-medium line-clamp-1">
                            {cat.subcategories.length} subcategories
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Cascading Subcategory & Business Type Selectors */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Subcategory / Domain <span className="text-rose-600">*</span>
                    </label>
                    <select
                      value={formData.subCategory}
                      onChange={(e) => handleSubCategoryChange(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-semibold focus:border-emerald-500 outline-none bg-white shadow-xs"
                    >
                      {availableSubcategories.map((s) => (
                        <option key={s.id} value={s.id}>
                          {getTaxonomyLabel(s)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Specific Business Type <span className="text-rose-600">*</span>
                    </label>
                    <select
                      value={formData.businessType}
                      onChange={(e) => handleBusinessTypeChange(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-semibold focus:border-emerald-500 outline-none bg-white shadow-xs"
                    >
                      {availableBusinessTypes.map((t) => (
                        <option key={t.id} value={t.id}>
                          {getTaxonomyLabel(t)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Classification Breadcrumb */}
                <div className="flex items-center gap-1.5 text-xs text-slate-700 pt-1 flex-wrap">
                  <span className="font-bold text-slate-500 text-[11px]">Classification:</span>
                  <span className="px-2 py-0.5 rounded-md bg-white border border-slate-200 font-bold text-slate-800 text-[11px]">
                    {getTaxonomyLabel(currentMain)}
                  </span>
                  <span className="text-slate-400">&rarr;</span>
                  <span className="px-2 py-0.5 rounded-md bg-white border border-slate-200 font-bold text-slate-800 text-[11px]">
                    {getTaxonomyLabel(currentSub)}
                  </span>
                  <span className="text-slate-400">&rarr;</span>
                  <span className="px-2 py-0.5 rounded-md bg-emerald-100 border border-emerald-300 font-bold text-emerald-900 text-[11px]">
                    {getTaxonomyLabel(currentType)}
                  </span>
                </div>

                {/* Custom Business Activity Input for "other_business" */}
                {formData.mainCategory === "other_business" && (
                  <div className="p-4 rounded-xl bg-amber-50/70 border border-amber-300/80 space-y-2 mt-2">
                    <label className="block text-xs font-bold text-amber-950">
                      Specify Your Custom Business Activity / Specialization <span className="text-rose-600">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Commercial Drone Surveying, Leather Tannery, Solar Heating"
                      value={formData.customCategoryName}
                      onChange={(e) => {
                        setFormData({ ...formData, customCategoryName: e.target.value });
                        if (fieldErrors.customCategoryName) setFieldErrors({ ...fieldErrors, customCategoryName: "" });
                      }}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-amber-300 text-xs font-bold text-slate-900 focus:border-emerald-600 outline-none"
                    />
                    {fieldErrors.customCategoryName && (
                      <span className="text-xs text-rose-600 font-semibold block">
                        {fieldErrors.customCategoryName}
                      </span>
                    )}
                    <p className="text-[11px] text-amber-800">
                      This will be shown on your business profile card and indexed in global search discovery.
                    </p>
                  </div>
                )}

                {fieldErrors.category && (
                  <span className="text-xs text-rose-600 font-semibold mt-1 block">
                    {fieldErrors.category}
                  </span>
                )}
              </div>

              {/* Secondary Business Activities (Multi-Activity Tagging) - Progressive Disclosure */}
              {!showSecondaryActivities && formData.secondaryActivities.length === 0 ? (
                <button
                  type="button"
                  onClick={() => setShowSecondaryActivities(true)}
                  className="w-full py-2.5 px-3.5 rounded-2xl border border-dashed border-slate-300 hover:border-emerald-500 hover:bg-emerald-50/40 text-slate-600 hover:text-emerald-800 transition-all text-xs font-bold flex items-center justify-between group cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-lg bg-slate-200 group-hover:bg-emerald-200 text-slate-700 group-hover:text-emerald-900 flex items-center justify-center text-xs font-black">
                      +
                    </span>
                    <span>Add Secondary Business Activities & Services (Optional)</span>
                  </div>
                  <span className="text-[11px] text-slate-400 group-hover:text-emerald-700 font-medium">
                    Expand tags
                  </span>
                </button>
              ) : (
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <label className="block text-xs font-bold text-slate-800">
                        Secondary Business Activities & Services <span className="text-slate-400 font-normal">(Optional)</span>
                      </label>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Select additional commercial capabilities your business offers to appear in broader customer searches.
                      </p>
                    </div>
                    {formData.secondaryActivities.length === 0 && (
                      <button
                        type="button"
                        onClick={() => setShowSecondaryActivities(false)}
                        className="text-xs text-slate-400 hover:text-slate-600 font-medium cursor-pointer"
                      >
                        Hide
                      </button>
                    )}
                  </div>

                  {/* Suggested Activity Chips */}
                  <div className="flex flex-wrap gap-2">
                    {SUGGESTED_SECONDARY_ACTIVITIES.map((act) => {
                      const isSelected = formData.secondaryActivities.includes(act.label);
                      return (
                        <button
                          key={act.id}
                          type="button"
                          onClick={() => toggleSecondaryActivity(act.label)}
                          className={`px-3 py-1.5 rounded-full text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                            isSelected
                              ? "bg-emerald-600 text-white shadow-xs"
                              : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-100"
                          }`}
                        >
                          <span>{act.icon}</span>
                          <span>{lang === "rw" ? act.labelRw : act.label}</span>
                          {isSelected && <Check className="w-3 h-3 ml-0.5" />}
                        </button>
                      );
                    })}
                  </div>

                  {/* Custom Secondary Activity Tag Input */}
                  <div className="flex items-center gap-2 pt-1">
                    <input
                      type="text"
                      placeholder="Add custom activity (e.g. Free Wi-Fi, Outdoor Garden Seating)..."
                      value={customActivityInput}
                      onChange={(e) => setCustomActivityInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addCustomSecondaryActivity();
                        }
                      }}
                      className="flex-1 px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-xs font-medium outline-none focus:border-emerald-500"
                    />
                    <button
                      type="button"
                      onClick={addCustomSecondaryActivity}
                      className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs cursor-pointer"
                    >
                      Add
                    </button>
                  </div>

                  {/* Active Custom Tags */}
                  {formData.secondaryActivities.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Active Tags:</span>
                      {formData.secondaryActivities.map((tag) => (
                        <span
                          key={tag}
                          className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-bold border border-emerald-200"
                        >
                          <span>{tag}</span>
                          <button
                            type="button"
                            onClick={() => toggleSecondaryActivity(tag)}
                            className="hover:text-rose-600 ml-0.5 cursor-pointer"
                          >
                            &times;
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Step 1 Actions */}
            <div className="pt-4 flex justify-end border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  if (validateStep1()) {
                    setErrorMsg(null);
                    setStep(2);
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  } else {
                    window.scrollTo({ top: 200, behavior: "smooth" });
                  }
                }}
                className="px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow-md transition-all flex items-center gap-2 cursor-pointer"
              >
                <span>Continue to Country & Location</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* SECTION 2: COUNTRY & LOCATION */}
        {step === 2 && (
          <div className="space-y-6">
            <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-card space-y-6">
              <div className="border-b border-slate-100 pb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                    <MapPin className="w-5 h-5 text-emerald-600" />
                    <span>Section 2: Operating Country & Ground Location</span>
                  </h2>
                  <p className="text-xs text-slate-500 mt-1">
                    Select your actual country of operation and pinpoint your physical store, office, or landmark coordinates.
                  </p>
                </div>
              </div>

              {/* Embedded SmartLocationForm */}
              <SmartLocationForm
                initialValues={locationData}
                businessName={formData.name}
                businessCategory={formData.category}
                errors={fieldErrors}
                onChange={(updated) => {
                  setLocationData(updated);
                  if (fieldErrors.nearestLandmark && updated.nearestLandmark?.trim()) {
                    setFieldErrors((prev) => ({ ...prev, nearestLandmark: "" }));
                  }
                }}
              />

              {/* Step 2 Actions */}
              <div className="pt-4 flex items-center justify-between border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setErrorMsg(null);
                    setStep(1);
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                  className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-bold text-xs hover:bg-slate-50 transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Back to Identity</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (validateStep2()) {
                      setErrorMsg(null);
                      setStep(3);
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    } else {
                      window.scrollTo({ top: 600, behavior: "smooth" });
                    }
                  }}
                  className="px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow-md transition-all flex items-center gap-2 cursor-pointer"
                >
                  <span>Continue to Contact & Ownership</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* SECTION 3: CONTACT & OWNERSHIP */}
        {step === 3 && (
          <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-card space-y-6">
            <div className="border-b border-slate-100 pb-4">
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <User className="w-5 h-5 text-emerald-600" />
                <span>Section 3: Contact & Business Ownership Account</span>
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Provide your representative details and create credentials for accessing your Private Partner Portal.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Owner Full Name (Required) */}
              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Owner / Representative Full Name <span className="text-rose-600">*</span>
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-3 pointer-events-none" />
                  <input
                    type="text"
                    required
                    autoComplete="name"
                    placeholder="e.g., Janvier Nkurunziza, Sarah Jenkins"
                    value={formData.ownerName}
                    onChange={(e) => {
                      setFormData({ ...formData, ownerName: e.target.value });
                      if (fieldErrors.ownerName) setFieldErrors({ ...fieldErrors, ownerName: "" });
                    }}
                    className={`w-full pl-10 pr-4 py-2.5 rounded-xl border text-sm font-medium outline-none transition-colors ${
                      fieldErrors.ownerName ? "border-rose-400 bg-rose-50/30" : "border-slate-300 focus:border-emerald-500 focus:bg-white"
                    }`}
                  />
                </div>
                {fieldErrors.ownerName && (
                  <span className="text-xs text-rose-600 font-semibold mt-1 block">
                    {fieldErrors.ownerName}
                  </span>
                )}
              </div>

              {/* Primary Phone Number with Polished Country Selector */}
              <div className="sm:col-span-2">
                <InternationalPhoneInput
                  id="primary-business-phone"
                  label="Primary Business Phone Number"
                  required
                  country={locationData.country || "Rwanda"}
                  onCountryChange={(newCountry) => {
                    setLocationData((prev) => ({ ...prev, country: newCountry }));
                  }}
                  value={formData.phone}
                  onChange={(val) => {
                    setFormData({ ...formData, phone: val });
                    if (fieldErrors.phone) setFieldErrors({ ...fieldErrors, phone: "" });
                  }}
                  error={fieldErrors.phone}
                  helperText="Customers will call this number directly for inquiries and purchases."
                />
              </div>

              {/* Conditional WhatsApp Toggle */}
              <div className="sm:col-span-2 pt-1">
                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={formData.hasDifferentWhatsapp}
                    onChange={(e) => setFormData({ ...formData, hasDifferentWhatsapp: e.target.checked })}
                    className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500"
                  />
                  <span className="text-xs font-bold text-slate-800">
                    Use a different mobile number for WhatsApp customer orders
                  </span>
                </label>
              </div>

              {/* Conditional WhatsApp Input */}
              {formData.hasDifferentWhatsapp && (
                <div className="sm:col-span-2">
                  <InternationalPhoneInput
                    id="dedicated-whatsapp-number"
                    label="Dedicated WhatsApp Number"
                    required
                    country={locationData.country || "Rwanda"}
                    value={formData.whatsapp}
                    onChange={(val) => {
                      setFormData({ ...formData, whatsapp: val });
                      if (fieldErrors.whatsapp) setFieldErrors({ ...fieldErrors, whatsapp: "" });
                    }}
                    error={fieldErrors.whatsapp}
                    helperText="Direct WhatsApp order link generated for catalog items."
                  />
                </div>
              )}

              {/* Owner Email (Optional / Recommended) */}
              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Owner Email Address <span className="text-slate-400 font-normal">(Optional — Recommended for official receipts)</span>
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-3 pointer-events-none" />
                  <input
                    type="email"
                    autoComplete="email"
                    placeholder="e.g., owner@yourbusiness.com"
                    value={formData.email}
                    onChange={(e) => {
                      setFormData({ ...formData, email: e.target.value });
                      if (fieldErrors.email) setFieldErrors({ ...fieldErrors, email: "" });
                    }}
                    className={`w-full pl-10 pr-4 py-2.5 rounded-xl border text-sm font-medium outline-none transition-colors ${
                      fieldErrors.email ? "border-rose-400 bg-rose-50/30" : "border-slate-300 focus:border-emerald-500 focus:bg-white"
                    }`}
                  />
                </div>
                {fieldErrors.email && (
                  <span className="text-xs text-rose-600 font-semibold mt-1 block">
                    {fieldErrors.email}
                  </span>
                )}
              </div>

              {/* Account Password (Required) */}
              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Partner Portal Password (min 6 chars) <span className="text-rose-600">*</span>
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3 pointer-events-none" />
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    autoComplete="new-password"
                    placeholder="Choose a secure password for logging into your Partner Portal"
                    value={formData.password}
                    onChange={(e) => {
                      setFormData({ ...formData, password: e.target.value });
                      if (fieldErrors.password) setFieldErrors({ ...fieldErrors, password: "" });
                    }}
                    className={`w-full pl-10 pr-10 py-2.5 rounded-xl border text-sm font-medium outline-none transition-colors ${
                      fieldErrors.password ? "border-rose-400 bg-rose-50/30" : "border-slate-300 focus:border-emerald-500 focus:bg-white"
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    tabIndex={-1}
                    className="absolute right-3 top-2.5 p-1 text-slate-400 hover:text-slate-600 transition-colors focus:outline-none cursor-pointer"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {fieldErrors.password ? (
                  <span className="text-xs text-rose-600 font-semibold mt-1 block">
                    {fieldErrors.password}
                  </span>
                ) : (
                  <span className="text-[11px] text-slate-500 mt-1 block">
                    You will use your phone number and this password to log into your Partner Portal at /auth/login.
                  </span>
                )}
              </div>
            </div>

            {/* Step 3 Actions */}
            <div className="pt-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setErrorMsg(null);
                  setStep(2);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
                className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-bold text-xs hover:bg-slate-50 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back to Location</span>
              </button>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    if (validateStep3()) {
                      setErrorMsg(null);
                      setStep(4);
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    } else {
                      window.scrollTo({ top: 200, behavior: "smooth" });
                    }
                  }}
                  className="px-4 py-2.5 rounded-xl border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 font-bold text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <span>Add Logo & Showcase (Optional)</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (validateStep3()) {
                      setErrorMsg(null);
                      setStep(5);
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    } else {
                      window.scrollTo({ top: 200, behavior: "smooth" });
                    }
                  }}
                  className="px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <span>Review & Submit (Fast Registration)</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* SECTION 4: BUSINESS PRESENTATION */}
        {step === 4 && (
          <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-card space-y-6">
            <div className="border-b border-slate-100 pb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <Camera className="w-5 h-5 text-emerald-600" />
                  <span>Section 4: Storefront Presentation & Showcase Catalog</span>
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  Upload your logo, cover photo, and showcase products or services to attract visitors.
                </p>
              </div>
              <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold">
                {operatingModel.model === "SERVICES" ? "Services-Based" : operatingModel.model === "FOOD_DINING" ? "Food & Dining" : "Product Retail"}
              </span>
            </div>

            {/* Optional Step Notice */}
            <div className="p-3.5 rounded-2xl bg-emerald-50/70 border border-emerald-200/80 flex items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 text-emerald-900">
                <Sparkles className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>
                  <strong>Optional Showcase:</strong> You can skip this step now and add photos or catalog items anytime from your Partner Portal.
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setErrorMsg(null);
                  setStep(5);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
                className="px-3 py-1.5 rounded-xl bg-white hover:bg-emerald-100 border border-emerald-300 text-emerald-800 font-bold text-xs shrink-0 cursor-pointer transition shadow-2xs"
              >
                Skip to Review &rarr;
              </button>
            </div>

            {/* Logo & Cover Media Uploads */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-2xl bg-slate-50 border border-slate-200">
              {/* Business Logo */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <ImageIcon className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Business Logo / Avatar <span className="text-slate-400 font-normal">(Optional)</span></span>
                </label>
                <input
                  type="file"
                  ref={logoInputRef}
                  accept="image/*"
                  onChange={handleLogoUpload}
                  className="hidden"
                />
                <div className="flex items-center gap-3">
                  {formData.logo ? (
                    <div className="relative w-16 h-16 rounded-xl overflow-hidden border border-slate-300 bg-white shadow-xs shrink-0">
                      <img src={formData.logo} alt="Logo" className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, logo: "" })}
                        className="absolute top-1 right-1 p-0.5 rounded-full bg-black/60 text-white hover:bg-rose-600 transition"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <div className="w-16 h-16 rounded-xl border-2 border-dashed border-slate-300 flex items-center justify-center text-slate-400 shrink-0 bg-white">
                      <Store className="w-6 h-6 text-slate-300" />
                    </div>
                  )}
                  <div className="flex-1 space-y-1.5">
                    <button
                      type="button"
                      onClick={() => logoInputRef.current?.click()}
                      disabled={uploadingLogo}
                      className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 text-xs font-bold text-slate-700 flex items-center gap-1.5 shadow-2xs cursor-pointer"
                    >
                      {uploadingLogo ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                      <span>{uploadingLogo ? "Processing..." : "Upload Logo"}</span>
                    </button>
                    <input
                      type="url"
                      placeholder="Or paste image URL..."
                      value={formData.logo}
                      onChange={(e) => setFormData({ ...formData, logo: e.target.value })}
                      className="w-full px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-[11px] outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Storefront Cover Photo */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <Camera className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Cover Banner Photo / Video <span className="text-slate-400 font-normal">(Optional)</span></span>
                </label>
                <input
                  type="file"
                  ref={coverInputRef}
                  accept="image/*,video/*"
                  onChange={handleCoverUpload}
                  className="hidden"
                />
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => coverInputRef.current?.click()}
                      disabled={uploadingCover}
                      className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 text-xs font-bold text-slate-700 flex items-center gap-1.5 shadow-2xs cursor-pointer"
                    >
                      {uploadingCover ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                      <span>{uploadingCover ? "Processing..." : "Upload Cover Media"}</span>
                    </button>
                    <input
                      type="url"
                      placeholder="Or paste media URL..."
                      value={formData.coverImage}
                      onChange={(e) => setFormData({ ...formData, coverImage: e.target.value })}
                      className="flex-1 px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-[11px] outline-none"
                    />
                  </div>
                  {formData.coverImage && (
                    <div className="relative aspect-[3/1] rounded-xl overflow-hidden bg-slate-900 border border-slate-200">
                      {isVideoMedia(formData.coverImage) ? (
                        <video src={formData.coverImage} controls autoPlay loop muted playsInline className="w-full h-full object-cover" />
                      ) : (
                        <img src={formData.coverImage} alt="Cover Preview" className="w-full h-full object-cover" />
                      )}
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, coverImage: "" })}
                        className="absolute top-1 right-1 p-1 rounded-full bg-black/60 text-white hover:bg-rose-600 transition"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Showcase Products & Services Catalog Subform */}
            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                  <Plus className="w-4 h-4 text-emerald-600" />
                  {editingItemIndex !== null ? "Edit Item" : "Add Initial Showcase Item or Service"}
                </span>
                {editingItemIndex !== null && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingItemIndex(null);
                      setItemDraft({
                        name: "",
                        nameRw: "",
                        description: "",
                        isService: operatingModel.isServiceDefault,
                        contactForPrice: false,
                        price: "",
                        priceMin: "",
                        priceMax: "",
                        priceType: "FIXED",
                        currency: defaultCurrency,
                        unit: operatingModel.model === "SERVICES" ? "service" : "item",
                        mediaUrl: "",
                        mediaType: "IMAGE",
                        mediaCaption: "",
                      });
                      setItemError(null);
                    }}
                    className="text-xs font-bold text-slate-500 hover:text-slate-800 flex items-center gap-1 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>Cancel Edit</span>
                  </button>
                )}
              </div>

              {itemError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{itemError}</span>
                </div>
              )}

              {/* Type Toggle: Product vs Service */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-600">Type:</span>
                <button
                  type="button"
                  onClick={() => setItemDraft((prev) => ({ ...prev, isService: false, unit: "item" }))}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    !itemDraft.isService
                      ? "bg-emerald-600 text-white shadow-xs"
                      : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-100"
                  }`}
                >
                  📦 Product
                </button>
                <button
                  type="button"
                  onClick={() => setItemDraft((prev) => ({ ...prev, isService: true, unit: "service" }))}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    itemDraft.isService
                      ? "bg-emerald-600 text-white shadow-xs"
                      : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-100"
                  }`}
                >
                  🛠️ Service
                </button>
              </div>

              {/* Item Names */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Item / Service Name *
                  </label>
                  <input
                    type="text"
                    placeholder={itemDraft.isService ? "e.g. Tailoring Suit, Software Development" : "e.g. Maize Flour 5kg, Leather Shoes"}
                    value={itemDraft.name}
                    onChange={(e) => {
                      setItemDraft({ ...itemDraft, name: e.target.value });
                      if (itemError) setItemError(null);
                    }}
                    className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs font-semibold focus:border-emerald-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Local / Kinyarwanda Name <span className="text-slate-400 font-normal">(Optional)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Kudoda Ikanzu, Ifu y'ibigori 5kg"
                    value={itemDraft.nameRw}
                    onChange={(e) => setItemDraft({ ...itemDraft, nameRw: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs font-semibold focus:border-emerald-500 outline-none"
                  />
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Description <span className="text-slate-400 font-normal">(Optional)</span>
                </label>
                <textarea
                  rows={2}
                  placeholder="Details, materials, turn-around time, sizes, warranty..."
                  value={itemDraft.description}
                  onChange={(e) => setItemDraft({ ...itemDraft, description: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs font-medium focus:border-emerald-500 outline-none resize-none"
                />
              </div>

              {/* Pricing */}
              <div className="p-3.5 rounded-xl bg-white border border-slate-200 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Tag className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Pricing Details</span>
                  </label>
                  <label className="inline-flex items-center gap-2 cursor-pointer bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200">
                    <input
                      type="checkbox"
                      checked={itemDraft.contactForPrice}
                      onChange={(e) =>
                        setItemDraft({
                          ...itemDraft,
                          contactForPrice: e.target.checked,
                          price: e.target.checked ? "0" : itemDraft.price,
                        })
                      }
                      className="w-3.5 h-3.5 accent-emerald-600 rounded cursor-pointer"
                    />
                    <span className="text-xs font-bold text-slate-700">
                      Call for Price (Quotation upon customer inquiry)
                    </span>
                  </label>
                </div>

                {!itemDraft.contactForPrice && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">Currency</label>
                      <select
                        value={itemDraft.currency || defaultCurrency}
                        onChange={(e) => setItemDraft({ ...itemDraft, currency: e.target.value })}
                        className="w-full px-2.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold outline-none"
                      >
                        {CURRENCY_OPTIONS.map((c) => (
                          <option key={c.code} value={c.code}>
                            {c.code} ({c.symbol})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">Pricing Mode</label>
                      <select
                        value={itemDraft.priceType}
                        onChange={(e) => setItemDraft({ ...itemDraft, priceType: e.target.value as any })}
                        className="w-full px-2.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold outline-none"
                      >
                        <option value="FIXED">Fixed Exact Price</option>
                        <option value="RANGE">Price Range (Min - Max)</option>
                        <option value="ESTIMATED">Estimated Price (~)</option>
                      </select>
                    </div>

                    {itemDraft.priceType === "RANGE" ? (
                      <>
                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 mb-1">
                            Min Price ({itemDraft.currency || defaultCurrency})
                          </label>
                          <input
                            type="number"
                            placeholder="e.g. 2000"
                            value={itemDraft.priceMin}
                            onChange={(e) => setItemDraft({ ...itemDraft, priceMin: e.target.value })}
                            className="w-full px-2.5 py-2 rounded-xl bg-white border border-slate-200 text-xs font-semibold outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 mb-1">
                            Max Price ({itemDraft.currency || defaultCurrency})
                          </label>
                          <input
                            type="number"
                            placeholder="e.g. 5000"
                            value={itemDraft.priceMax}
                            onChange={(e) => setItemDraft({ ...itemDraft, priceMax: e.target.value })}
                            className="w-full px-2.5 py-2 rounded-xl bg-white border border-slate-200 text-xs font-semibold outline-none"
                          />
                        </div>
                      </>
                    ) : (
                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 mb-1">
                          Price ({itemDraft.currency || defaultCurrency}) *
                        </label>
                        <input
                          type="number"
                          placeholder="e.g. 3500"
                          value={itemDraft.price}
                          onChange={(e) => setItemDraft({ ...itemDraft, price: e.target.value })}
                          className="w-full px-2.5 py-2 rounded-xl bg-white border border-slate-200 text-xs font-bold outline-none"
                        />
                      </div>
                    )}

                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">Unit</label>
                      <input
                        type="text"
                        placeholder={itemDraft.isService ? "e.g. service, hour" : "e.g. item, kg, pair"}
                        value={itemDraft.unit}
                        onChange={(e) => setItemDraft({ ...itemDraft, unit: e.target.value })}
                        className="w-full px-2.5 py-2 rounded-xl bg-white border border-slate-200 text-xs font-semibold outline-none"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Media Upload & Automatic Default Caption */}
              <div className="p-3.5 rounded-xl bg-white border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Camera className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Attach Photo or Video <span className="text-slate-400 font-normal">(Optional)</span></span>
                  </label>
                  {itemDraft.mediaUrl && (
                    <button
                      type="button"
                      onClick={() => setItemDraft({ ...itemDraft, mediaUrl: "", mediaCaption: "" })}
                      className="text-[11px] font-bold text-rose-600 hover:text-rose-700 flex items-center gap-1 cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>Remove Media</span>
                    </button>
                  )}
                </div>

                {!itemDraft.mediaUrl ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className="flex flex-col items-center justify-center p-4 rounded-xl border-2 border-dashed border-slate-200 hover:border-emerald-400 hover:bg-emerald-50/40 cursor-pointer transition-colors text-center">
                      <Upload className="w-5 h-5 text-emerald-600 mb-1" />
                      <span className="text-xs font-bold text-slate-800">
                        Choose Image, File or Video
                      </span>
                      <span className="text-[10px] text-slate-400 mt-0.5">PNG, JPG, MP4 up to 15MB</span>
                      <input
                        type="file"
                        accept="image/*,video/*,.pdf"
                        onChange={handleItemFileUpload}
                        className="hidden"
                      />
                    </label>

                    <div className="flex flex-col justify-center space-y-1.5">
                      <span className="text-[11px] font-bold text-slate-600">Or Paste Media URL:</span>
                      <input
                        type="url"
                        placeholder="https://... (image or video link)"
                        value={itemDraft.mediaUrl}
                        onChange={(e) => setItemDraft({ ...itemDraft, mediaUrl: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-medium outline-none focus:border-emerald-500"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                      {itemDraft.mediaType === "IMAGE" ? (
                        <img src={itemDraft.mediaUrl} alt="Item Preview" className="w-16 h-16 object-cover rounded-lg border border-slate-200" />
                      ) : (
                        <div className="w-16 h-16 rounded-lg bg-slate-900 flex flex-col items-center justify-center text-emerald-400">
                          <Video className="w-6 h-6" />
                          <span className="text-[8px] font-bold mt-0.5">VIDEO</span>
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <span className="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase bg-emerald-100 text-emerald-800">
                          {itemDraft.mediaType} ATTACHED
                        </span>
                        <p className="text-[11px] text-slate-500 mt-1 truncate">
                          Caption auto-defaults from item name if left blank.
                        </p>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Media Caption <span className="text-slate-400 font-normal">(Defaults to item name if empty)</span>
                      </label>
                      <input
                        type="text"
                        placeholder={itemDraft.name || "Showcase item caption..."}
                        value={itemDraft.mediaCaption}
                        onChange={(e) => setItemDraft({ ...itemDraft, mediaCaption: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs font-semibold outline-none focus:border-emerald-500"
                      />
                    </div>
                  </div>
                )}

                {/* Save Item Button */}
                <div className="pt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={handleSaveItem}
                    className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md transition flex items-center gap-1.5 cursor-pointer"
                  >
                    <Check className="w-4 h-4" />
                    <span>{editingItemIndex !== null ? "Save Changes to Item" : "Add to Showcase List"}</span>
                  </button>
                </div>
              </div>

              {/* Items List */}
              <div className="space-y-2 pt-2">
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-700">
                  Added Showcase Items ({products.length})
                </h3>
                {products.length === 0 ? (
                  <div className="p-4 rounded-xl bg-white border border-dashed border-slate-200 text-center text-xs text-slate-400">
                    No items added yet. You can add showcase items now or later from your Partner Portal.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-2">
                    {products.map((p, idx) => (
                      <div
                        key={p.id || idx}
                        className="flex items-center justify-between gap-3 p-3 rounded-xl bg-white border border-slate-200 text-xs"
                      >
                        <div className="flex items-center gap-3">
                          {p.mediaUrl ? (
                            <img src={p.mediaUrl} alt={p.name} className="w-10 h-10 object-cover rounded-lg border border-slate-200 shrink-0" />
                          ) : (
                            <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-800 font-bold flex items-center justify-center shrink-0">
                              {idx + 1}
                            </div>
                          )}
                          <div>
                            <div className="font-bold text-slate-900">{p.name}</div>
                            <div className="text-[10px] text-slate-500">
                              {p.contactForPrice ? "Call for Price" : `${p.priceType === "ESTIMATED" ? "Estimated Price: ~" : ""}${Number(p.price).toLocaleString()} ${p.currency || defaultCurrency}`}
                              {p.mediaCaption && ` • "${p.mediaCaption}"`}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleEditItem(idx)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-emerald-700 cursor-pointer"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(idx)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Step 4 Actions */}
            <div className="pt-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setErrorMsg(null);
                  setStep(3);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
                className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-bold text-xs hover:bg-slate-50 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back to Contact</span>
              </button>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    setErrorMsg(null);
                    setStep(5);
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-600 font-bold text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <span>Skip & Complete Later in Portal</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (validateStep4()) {
                      setErrorMsg(null);
                      setStep(5);
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }
                  }}
                  className="px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <span>Continue to Review & Submit</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* SECTION 5: REVIEW & SUBMIT */}
        {step === 5 && !registeredBusinessId && (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-card space-y-6">
              <div className="border-b border-slate-100 pb-4">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 text-emerald-800 text-xs font-bold mb-2">
                  <FileCheck className="w-4 h-4 text-emerald-600" />
                  <span>Section 5: Final Review & Submission</span>
                </div>
                <h2 className="text-xl font-extrabold text-slate-900">
                  Review Your Business Information
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  Verify your details across all 4 sections. Use the edit shortcuts to adjust any section before final submission.
                </p>
              </div>

              {/* 4 Structured Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                {/* Summary Card 1: Identity & Classification */}
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                      <Store className="w-3.5 h-3.5 text-emerald-600" />
                      1. Business Identity
                    </span>
                    <button
                      type="button"
                      onClick={() => setStep(1)}
                      className="text-[11px] font-bold text-emerald-700 hover:text-emerald-800 flex items-center gap-1 cursor-pointer"
                    >
                      <Edit3 className="w-3 h-3" />
                      Edit Identity
                    </button>
                  </div>
                  <div className="space-y-1 text-xs text-slate-700">
                    <div><strong className="text-slate-900">Business Name:</strong> {formData.name}</div>
                    {formData.nameRw && <div><strong className="text-slate-900">Local Name:</strong> {formData.nameRw}</div>}
                    <div className="pt-1 pb-1 border-y border-slate-200/80 my-1 space-y-0.5 bg-white p-2 rounded-lg text-[11px]">
                      <div><span className="text-slate-500">Sector:</span> <strong>{getTaxonomyLabel(currentMain)}</strong></div>
                      <div><span className="text-slate-500">Domain:</span> <strong>{getTaxonomyLabel(currentSub)}</strong></div>
                      <div><span className="text-slate-500">Type:</span> <strong className="text-emerald-700">{getTaxonomyLabel(currentType)}</strong></div>
                      {formData.mainCategory === "other_business" && formData.customCategoryName && (
                        <div className="text-amber-800 font-bold">Custom Activity: {formData.customCategoryName}</div>
                      )}
                    </div>
                    {formData.secondaryActivities.length > 0 && (
                      <div>
                        <strong className="text-slate-900">Secondary Activities:</strong>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {formData.secondaryActivities.map((act) => (
                            <span key={act} className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                              {act}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Summary Card 2: Ground Location */}
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                      <Compass className="w-3.5 h-3.5 text-emerald-600" />
                      2. Operating Location
                    </span>
                    <button
                      type="button"
                      onClick={() => setStep(2)}
                      className="text-[11px] font-bold text-emerald-700 hover:text-emerald-800 flex items-center gap-1 cursor-pointer"
                    >
                      <Edit3 className="w-3 h-3" />
                      Edit Location
                    </button>
                  </div>
                  <div className="space-y-1 text-xs text-slate-700">
                    <div><strong className="text-slate-900">Country:</strong> {countryConfig.flag} {locationData.country}</div>
                    <div><strong className="text-slate-900">{countryConfig.fieldLabels.level1}:</strong> {locationData.province}</div>
                    <div><strong className="text-slate-900">{countryConfig.fieldLabels.level2} & {countryConfig.fieldLabels.level3}:</strong> {locationData.district} &rarr; {locationData.sector}</div>
                    <div><strong className="text-slate-900">{countryConfig.fieldLabels.level4}:</strong> {locationData.cell}</div>
                    <div><strong className="text-slate-900">Landmark:</strong> {locationData.nearestLandmark}</div>
                    <div className="pt-1 flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 font-mono text-[10px] font-bold">
                        GPS: {locationData.latitude.toFixed(4)}, {locationData.longitude.toFixed(4)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Summary Card 3: Contact & Owner Account */}
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-emerald-600" />
                      3. Contact & Ownership
                    </span>
                    <button
                      type="button"
                      onClick={() => setStep(3)}
                      className="text-[11px] font-bold text-emerald-700 hover:text-emerald-800 flex items-center gap-1 cursor-pointer"
                    >
                      <Edit3 className="w-3 h-3" />
                      Edit Contact
                    </button>
                  </div>
                  <div className="space-y-1 text-xs text-slate-700">
                    <div><strong className="text-slate-900">Proprietor:</strong> {formData.ownerName}</div>
                    <div><strong className="text-slate-900">Primary Phone:</strong> <span className="font-mono font-bold text-slate-900">{formatPhoneWithCountry(formData.phone, countryConfig.phonePrefix)}</span></div>
                    <div><strong className="text-slate-900">WhatsApp:</strong> <span className="font-mono font-bold text-slate-900">{formatPhoneWithCountry(formData.hasDifferentWhatsapp ? formData.whatsapp : formData.phone, countryConfig.phonePrefix)}</span></div>
                    {formData.email && <div><strong className="text-slate-900">Email:</strong> {formData.email}</div>}
                    <div className="text-[11px] text-emerald-700 font-bold pt-1">
                      ✓ Partner Portal Password configured
                    </div>
                  </div>
                </div>

                {/* Summary Card 4: Storefront Presentation */}
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-emerald-600" />
                      4. Presentation & Showcase
                    </span>
                    <button
                      type="button"
                      onClick={() => setStep(4)}
                      className="text-[11px] font-bold text-emerald-700 hover:text-emerald-800 flex items-center gap-1 cursor-pointer"
                    >
                      <Edit3 className="w-3 h-3" />
                      Edit Presentation
                    </button>
                  </div>
                  <div className="space-y-1 text-xs text-slate-700">
                    <div><strong className="text-slate-900">Logo:</strong> {formData.logo ? "✓ Uploaded" : "Neutral fallback"}</div>
                    <div><strong className="text-slate-900">Cover Media:</strong> {formData.coverImage ? "✓ Uploaded" : "Standard MOSA banner"}</div>
                    <div><strong className="text-slate-900">Showcase Catalog:</strong> {products.length} {products.length === 1 ? "item" : "items"} attached</div>
                  </div>
                </div>
              </div>

              {/* Completeness Checklist */}
              <div className="p-4 rounded-2xl bg-slate-100/70 border border-slate-200 space-y-2.5">
                <div className="text-xs font-black uppercase tracking-wider text-slate-700">
                  Application Completeness Checklist
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {validationChecklist.map((item) => (
                    <div key={item.id} className="flex items-center justify-between px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs">
                      <div className="flex items-center gap-2">
                        {item.valid ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        ) : (
                          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                        )}
                        <span className={item.valid ? "text-slate-800 font-medium" : "text-rose-700 font-bold"}>
                          {item.label}
                        </span>
                      </div>
                      {!item.valid && (
                        <button
                          type="button"
                          onClick={() => setStep(item.step as any)}
                          className="text-[10px] font-bold text-rose-600 hover:underline cursor-pointer"
                        >
                          Fix &rarr;
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Required Owner Certification */}
              <div className="p-4 rounded-2xl bg-emerald-50/50 border border-emerald-200 space-y-2">
                <label className="flex items-start gap-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    required
                    checked={formData.certifyAccurate}
                    onChange={(e) => setFormData({ ...formData, certifyAccurate: e.target.checked })}
                    className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 mt-0.5"
                  />
                  <div className="text-xs text-slate-800 font-medium leading-relaxed">
                    <strong className="font-bold text-emerald-950 block mb-0.5">
                      Owner Declaration &amp; Authorization:
                    </strong>
                    I certify that I am the business owner or authorized representative and that all provided business information is true, accurate, and ready for official verification.
                  </div>
                </label>
              </div>

              {/* Actions */}
              <div className="pt-4 flex items-center justify-between border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setStep(4)}
                  className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-bold text-xs hover:bg-slate-50 transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Back to Presentation</span>
                </button>
                
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-8 py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow-lg hover:shadow-emerald-600/25 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Registering & Launching Portal...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Complete Registration & Launch Owner Portal</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </form>
        )}

        {/* POST-SUBMISSION: INSTANT ACTIVATION & PAYMENT CHECKOUT */}
        {step === 5 && registeredBusinessId && (
          <div className="bg-white rounded-3xl border border-slate-200 shadow-card p-6 sm:p-8 space-y-6">
            <div className="text-center space-y-2 pb-4 border-b border-slate-100">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold">
                <ShieldCheck className="w-4 h-4" />
                <span>Instant Activation & Verification</span>
              </div>
              <h3 className="text-2xl font-black text-slate-900 tracking-tight">
                {paymentStatus === "CONFIRMED" 
                  ? "Payment Confirmed & Business Activated!"
                  : "Business Registration & Instant Activation"}
              </h3>
              <p className="text-xs text-slate-600 max-w-md mx-auto">
                {paymentStatus === "CONFIRMED"
                  ? "Your business is now fully active and discoverable on the 55 MOSA community directory."
                  : "Complete the standard activation fee to automatically verify your business and unlock global discovery."}
              </p>
            </div>

            {/* Business Snapshot Card */}
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 flex items-center justify-between text-xs">
              <div>
                <div className="text-[10px] uppercase font-bold text-slate-400">Registered Business</div>
                <div className="font-bold text-slate-900 text-sm">{registeredBusinessName || formData.name}</div>
                <div className="text-slate-500 text-[11px]">{formData.ownerName} • {formData.phone}</div>
              </div>
              <div className="text-right">
                <div className="text-[10px] uppercase font-bold text-slate-400">Registration Fee</div>
                {paymentConfig?.fee?.isFree || paymentConfig?.fee?.amount === 0 ? (
                  <span className="text-sm font-black text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                    FREE (0 RWF)
                  </span>
                ) : (
                  <span className="text-base font-black text-emerald-700">
                    {paymentConfig?.fee?.amount !== undefined ? paymentConfig.fee.amount.toLocaleString() : "5,000"} {paymentConfig?.fee?.currency || "RWF"}
                  </span>
                )}
              </div>
            </div>

            {/* Confirmed State */}
            {paymentStatus === "CONFIRMED" ? (
              <div className="p-6 rounded-2xl bg-emerald-50 border-2 border-emerald-500/30 text-center space-y-4">
                <div className="w-14 h-14 rounded-full bg-emerald-600 text-white mx-auto flex items-center justify-center shadow-md">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
                <div className="space-y-1">
                  <h4 className="text-lg font-black text-emerald-950">Official Activation Confirmed!</h4>
                  <p className="text-xs text-emerald-800">
                    Your numbered official receipt is ready, and your business is now active for discovery.
                  </p>
                </div>
                {confirmedReceipt?.receiptNumber && (
                  <div className="inline-block p-3 rounded-xl bg-white border border-emerald-200 font-mono text-xs font-bold text-emerald-900">
                    Receipt: {confirmedReceipt.receiptNumber}
                  </div>
                )}
                <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowReceiptModal(true)}
                    className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-white border border-emerald-300 text-emerald-800 hover:bg-emerald-100 font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer shadow-xs"
                  >
                    <Printer className="w-4 h-4" />
                    <span>View &amp; Print Official Receipt</span>
                  </button>
                  <Link
                    href="/owner/dashboard"
                    className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-2 transition shadow-md"
                  >
                    <span>Proceed to Partner Portal</span>
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
              </div>
            ) : (
              /* UrubutoPay-Style Mobile Money Checkout */
              <div className="space-y-5">
                <UrubutoStyleCheckout
                  businessId={registeredBusinessId || ""}
                  businessName={registeredBusinessName || formData.name}
                  defaultPhone={formatPhoneWithCountry(formData.phone, countryConfig.phonePrefix)}
                  feeConfig={paymentConfig?.fee}
                  providers={paymentConfig?.providers}
                  checkoutType="REGISTRATION"
                  initialReference={activePayment?.paymentReference}
                  onPaymentSuccess={(receipt, payment) => {
                    setPaymentStatus("CONFIRMED");
                    setConfirmedReceipt(receipt);
                    setActivePayment(payment);
                    setShowReceiptModal(true);
                  }}
                  onViewReceipt={(receipt) => {
                    setConfirmedReceipt(receipt);
                    setShowReceiptModal(true);
                  }}
                />
                <div className="flex items-center justify-between pt-2">
                  <Link
                    href="/owner/dashboard"
                    className="text-xs text-slate-500 hover:text-slate-800 underline font-medium"
                  >
                    Pay later in Partner Portal
                  </Link>
                  <Link
                    href="/owner/dashboard"
                    className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-black text-white font-bold text-xs flex items-center gap-2 shadow-xs transition"
                  >
                    <span>Go to Partner Portal</span>
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Receipt Modal */}
        {showReceiptModal && (
          <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 print:fixed print:inset-0 print:bg-white print:p-6 print:z-[9999] print:block">
            <div className="bg-white rounded-3xl max-w-xl w-full p-8 shadow-2xl border border-slate-200 text-slate-900 space-y-6 print:shadow-none print:border-none print:p-0 print:max-w-none">
              <div className="flex items-start justify-between border-b border-slate-100 pb-4">
                <div>
                  <div className="flex items-center gap-2.5">
                    <img src="/mosa-logo.jpg" alt="MOSA" className="w-10 h-10 rounded-xl object-contain bg-white border border-slate-200/80 shadow-xs print:border-slate-300" />
                    <h3 className="font-black text-lg text-slate-900">MOSA OFFICIAL RECEIPT</h3>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Business Community Discovery Network
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowReceiptModal(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer print:hidden"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Receipt Paper */}
              <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 font-mono text-xs space-y-4 print:bg-slate-50/50 print:border-slate-300">
                <div className="flex justify-between items-center border-b border-slate-200 pb-3">
                  <div>
                    <div className="text-[10px] text-slate-400 uppercase">Receipt Number</div>
                    <div className="text-sm font-bold text-emerald-800">{confirmedReceipt?.receiptNumber || activePayment?.paymentReference}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] text-slate-400 uppercase">Issue Date</div>
                    <div className="text-xs font-semibold text-slate-700">{new Date().toLocaleDateString()}</div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <div className="text-[10px] text-slate-400 uppercase">Business Entity</div>
                    <div className="font-bold text-slate-900">{registeredBusinessName || formData.name}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-400 uppercase">Proprietor</div>
                    <div className="font-bold text-slate-900">{formData.ownerName}</div>
                    <div className="text-slate-500 text-[11px]">{formData.phone}</div>
                  </div>
                </div>

                <div className="border-t border-b border-slate-200 py-3 space-y-1">
                  <div className="flex justify-between font-bold text-slate-900">
                    <span>Description</span>
                    <span>Amount</span>
                  </div>
                  <div className="flex justify-between text-slate-700">
                    <span>MOSA Platform Business Registration &amp; Activation Fee</span>
                    <span>
                      {confirmedReceipt?.amountPaid !== undefined
                        ? `${confirmedReceipt.amountPaid.toLocaleString()} RWF`
                        : paymentConfig?.fee?.isFree || paymentConfig?.fee?.amount === 0
                        ? "0 RWF (Free Waiver)"
                        : `${paymentConfig?.fee?.amount !== undefined ? paymentConfig.fee.amount.toLocaleString() : "5,000"} RWF`}
                    </span>
                  </div>
                </div>

                <div className="flex justify-between items-center font-bold text-sm text-slate-900">
                  <span>TOTAL PAID</span>
                  <span className="text-emerald-700">
                    {confirmedReceipt?.amountPaid !== undefined
                      ? `${confirmedReceipt.amountPaid.toLocaleString()} RWF`
                      : paymentConfig?.fee?.isFree || paymentConfig?.fee?.amount === 0
                      ? "0 RWF (Free Waiver)"
                      : `${paymentConfig?.fee?.amount !== undefined ? paymentConfig.fee.amount.toLocaleString() : "5,000"} RWF`}
                  </span>
                </div>

                <div className="pt-2 text-[10px] text-slate-500 border-t border-slate-200">
                  Status: CONFIRMED &amp; ACTIVATED. Discoverable on live directory.
                </div>
              </div>

              <div className="flex justify-between items-center pt-2 print:hidden">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl flex items-center gap-1.5 transition cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print Receipt</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowReceiptModal(false)}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Bottom Link for Existing Owners */}
        <div className="text-center text-xs text-slate-500">
          <span>{t.registration.alreadyRegistered} </span>
          <Link href="/auth/login" className="text-emerald-700 font-bold underline hover:text-emerald-800">
            {t.registration.loginLink}
          </Link>
        </div>

      </div>
    </div>
  );
}
