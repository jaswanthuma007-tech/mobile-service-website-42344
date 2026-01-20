import React, { useEffect, useMemo, useRef, useState } from "react";
import { Route, Routes, useNavigate } from "react-router-dom";
import BookingFlow from "./BookingFlow";
import TopInfoBar from "./components/TopInfoBar";
import "./App.css";

/**
 * Build a Google Maps "search/center" embed URL.
 * We use an iframe embed to avoid adding map SDK dependencies while still allowing
 * dynamic centering and marker placement via URL parameters.
 */
function buildGoogleMapsEmbedSrc({ q, lat, lng, z = 14 }) {
  // Prefer lat/lng when available (user location), otherwise fallback to q.
  const zoom = Number.isFinite(Number(z)) ? Number(z) : 14;

  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    // Center at lat/lng and add a marker at the same coordinate.
    // Note: this is a public embed; no API key required.
    return `https://www.google.com/maps?q=${lat},${lng}&z=${zoom}&output=embed`;
  }

  const query = String(q || "").trim() || "New York";
  return `https://www.google.com/maps?q=${encodeURIComponent(query)}&z=${zoom}&output=embed`;
}

/**
 * Get current position as a Promise, with robust timeout/error handling.
 * We keep this helper local to avoid introducing new dependencies.
 */
function getCurrentPositionPromise(options) {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("Geolocation is not supported by your browser."));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, options);
  });
}

/**
 * A small embedded-map component with a "Locate Me" overlay button.
 * Uses browser geolocation to center the map and show a marker at the user's location.
 */
function StoreLocatorMap() {
  const [mapCenter, setMapCenter] = useState({ lat: null, lng: null });
  const [ui, setUi] = useState({ state: "idle", message: "" }); // idle | locating | error | done

  // Default map location (demo): New York
  const defaultSrc = useMemo(() => buildGoogleMapsEmbedSrc({ q: "New York", z: 12 }), []);
  const mapSrc = useMemo(() => {
    if (Number.isFinite(mapCenter.lat) && Number.isFinite(mapCenter.lng)) {
      return buildGoogleMapsEmbedSrc({ lat: mapCenter.lat, lng: mapCenter.lng, z: 15 });
    }
    return defaultSrc;
  }, [defaultSrc, mapCenter.lat, mapCenter.lng]);

  const locateMe = async () => {
    // Clear previous errors and show busy state.
    setUi({ state: "locating", message: "Requesting your location…" });

    // If Permissions API exists, we can preflight to provide better messaging.
    try {
      if (navigator?.permissions?.query) {
        const status = await navigator.permissions.query({ name: "geolocation" });
        if (status.state === "denied") {
          setUi({
            state: "error",
            message:
              "Location permission is blocked. Please enable location access for this site in your browser settings, then try again.",
          });
          return;
        }
      }
    } catch {
      // Permissions API not available or query failed; proceed to getCurrentPosition().
    }

    try {
      const pos = await getCurrentPositionPromise({
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 15_000,
      });

      const lat = pos?.coords?.latitude;
      const lng = pos?.coords?.longitude;

      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        setUi({ state: "error", message: "Unable to read your location coordinates. Please try again." });
        return;
      }

      setMapCenter({ lat, lng });
      setUi({ state: "done", message: "Centered on your current location." });
    } catch (err) {
      // Normalize common geolocation errors.
      const code = err?.code;
      const message =
        code === 1
          ? "Location permission was denied. Please allow location access and try again."
          : code === 2
            ? "Location unavailable. Please check GPS/network and try again."
            : code === 3
              ? "Timed out while retrieving location. Please try again."
              : err?.message || "Unable to retrieve your location.";

      setUi({ state: "error", message });
    }
  };

  return (
    <div className="MapWrap MapWrapWithControls" aria-label="Map">
      <div className="MapControls">
        <button type="button" className="MapLocateBtn" onClick={locateMe} disabled={ui.state === "locating"}>
          {ui.state === "locating" ? "Locating…" : "Locate Me"}
        </button>
        <div
          className={`MapHint ${ui.state === "error" ? "is-error" : ui.state === "done" ? "is-done" : ""}`}
          role={ui.state === "error" ? "alert" : "status"}
          aria-live="polite"
        >
          {ui.message}
        </div>
      </div>

      <iframe
        title="Store locator map"
        src={mapSrc}
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
      />
    </div>
  );
}

/**
 * Backend base URL.
 * - In dev, CRA will use `src/setupProxy.js` to proxy `/api/*` to the backend.
 * - In environments without proxying, set REACT_APP_BACKEND_URL to e.g. http://localhost:3001
 */
const BACKEND_BASE_URL = process.env.REACT_APP_BACKEND_URL || "";

/**
 * Small helper for JSON fetch with good error handling.
 * @param {string} path API path beginning with `/api/...`
 * @param {RequestInit} init fetch init options
 * @returns {Promise<any>} parsed JSON response
 */
async function fetchJson(path, init) {
  const res = await fetch(`${BACKEND_BASE_URL}${path}`, {
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers || {}),
    },
    ...init,
  });

  const contentType = res.headers.get("content-type") || "";
  const body = contentType.includes("application/json") ? await res.json() : await res.text();

  if (!res.ok) {
    const message =
      typeof body === "object" && body && body.message
        ? body.message
        : typeof body === "string"
          ? body
          : `Request failed (${res.status})`;
    const err = new Error(message);
    err.status = res.status;
    err.body = body;
    throw err;
  }

  return body;
}

function normalizePhone(phone) {
  const p = String(phone || "").trim();
  if (!p) return "";
  if (p.startsWith("+")) return "+" + p.slice(1).replace(/\D/g, "");
  return p.replace(/\D/g, "");
}

/**
 * Booking form requirement: allow only digits and enforce exactly 10 digits.
 * We keep this separate from normalizePhone() because other parts of the app
 * (e.g. tracking) may accept more flexible formats.
 */
function normalizeBookingPhone(value) {
  return String(value || "").replace(/\D/g, "").slice(0, 10);
}

function isValidBookingPhone(value) {
  return /^[0-9]{10}$/.test(String(value || ""));
}

function normalizeBookingPincode(value) {
  return String(value || "").replace(/\D/g, "").slice(0, 6);
}

function isValidPincode(pincode) {
  return /^[0-9]{6}$/.test(String(pincode || "").trim());
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function formatStatus(status) {
  const s = String(status || "").trim();
  return s || "Pending";
}

/** Inner home page (single-page sections) extracted to keep App routing clean. */
function HomeShell() {
  const navigate = useNavigate();

  const sections = useMemo(
    () => [
      { id: "home", label: "Home" },
      { id: "track", label: "Track Status" },
      { id: "services", label: "Services" },
      { id: "store", label: "Store Locator" },
      { id: "brands", label: "Brands" },
      { id: "about", label: "About Us" },
      { id: "contact", label: "Contact" },
      { id: "blogs", label: "Blogs" },
      { id: "auth", label: "Login/Signup" },
      { id: "admin", label: "Admin" },
    ],
    [],
  );

  const [activeSection, setActiveSection] = useState("home");
  const [navOpen, setNavOpen] = useState(false);

  const [services, setServices] = useState([]);
  const [loadingServices, setLoadingServices] = useState(false);

  const [booking, setBooking] = useState({ name: "", phone: "", pincode: "" });
  const [bookingTouched, setBookingTouched] = useState({});
  const [bookingStatus, setBookingStatus] = useState({ state: "idle", message: "" }); // idle | checking | loading | success | error
  const [pincodeStatus, setPincodeStatus] = useState({ state: "idle", valid: null, message: "" }); // idle | checking | done

  // Refs for Enter-key navigation (works for desktop and mobile virtual keyboard "Enter/Next").
  const bookingNameRef = useRef(null);
  const bookingPhoneRef = useRef(null);
  const bookingPincodeRef = useRef(null);
  const bookingCheckBtnRef = useRef(null);
  const bookingSubmitBtnRef = useRef(null);

  /**
   * Adds a short highlight animation to the newly focused input.
   * We keep this DOM-based (classList) so it works even if focus is moved programmatically.
   */
  const flashFocus = (el) => {
    if (!el) return;
    el.classList.remove("FocusFlash");
    // Force reflow so re-adding the class restarts the animation reliably.
    // eslint-disable-next-line no-unused-expressions
    el.offsetHeight;
    el.classList.add("FocusFlash");
  };

  const focusAndFlash = (el) => {
    if (!el) return;
    el.focus();
    flashFocus(el);
  };

  // PUBLIC_INTERFACE
  const handleBookingKeyDown = (field) => (e) => {
    // Support IME composition: do nothing while composing.
    if (e.isComposing) return;

    if (e.key !== "Enter") return;

    // Prevent accidental form submit on Enter in Name/Phone (requested).
    // Also keeps behavior consistent on mobile where Enter may submit.
    if (field === "name" || field === "phone") {
      e.preventDefault();
    }

    if (field === "name") {
      focusAndFlash(bookingPhoneRef.current);
      return;
    }

    if (field === "phone") {
      focusAndFlash(bookingPincodeRef.current);
      return;
    }

    if (field === "pincode") {
      // For pincode: trigger "Check" if available; otherwise focus Book Now.
      e.preventDefault();

      if (bookingCheckBtnRef.current && !bookingCheckBtnRef.current.disabled) {
        bookingCheckBtnRef.current.click();
        // Keep user in the pincode field after checking (better UX on mobile).
        focusAndFlash(bookingPincodeRef.current);
      } else {
        focusAndFlash(bookingSubmitBtnRef.current);
      }
    }
  };

  const [sliderIndex, setSliderIndex] = useState(0);

  // Tracking state
  const [trackMode, setTrackMode] = useState("booking_id"); // booking_id | phone
  const [trackInput, setTrackInput] = useState("");
  const [trackState, setTrackState] = useState({ state: "idle", message: "", booking: null }); // idle | loading | error | done

  // Admin state
  const [adminCreds, setAdminCreds] = useState({ username: "", password: "" });
  const [adminToken, setAdminToken] = useState("");
  const [adminStatus, setAdminStatus] = useState({ state: "idle", message: "" }); // idle | loading | error | success
  const [adminBookings, setAdminBookings] = useState([]);

  const homeRef = useRef(null);
  const trackRef = useRef(null);
  const servicesRef = useRef(null);
  const storeRef = useRef(null);
  const brandsRef = useRef(null);
  const aboutRef = useRef(null);
  const contactRef = useRef(null);
  const blogsRef = useRef(null);
  const authRef = useRef(null);
  const adminRef = useRef(null);

  const refById = useMemo(
    () => ({
      home: homeRef,
      track: trackRef,
      services: servicesRef,
      store: storeRef,
      brands: brandsRef,
      about: aboutRef,
      contact: contactRef,
      blogs: blogsRef,
      auth: authRef,
      admin: adminRef,
    }),
    [],
  );

  // Smooth scroll to section.
  // PUBLIC_INTERFACE
  const scrollToSection = (id) => {
    const el = refById[id]?.current;
    if (!el) return;
    setNavOpen(false);
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // Slider auto-advance.
  useEffect(() => {
    const t = window.setInterval(() => setSliderIndex((i) => (i + 1) % 3), 4500);
    return () => window.clearInterval(t);
  }, []);

  // Services from backend (fallback to required list).
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoadingServices(true);
      try {
        const svc = await fetchJson("/api/services");
        if (cancelled) return;
        setServices(Array.isArray(svc?.services) ? svc.services : []);
      } catch {
        if (!cancelled) setServices([]);
      } finally {
        if (!cancelled) setLoadingServices(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Track active section with IntersectionObserver.
  useEffect(() => {
    const entries = [
      { id: "home", ref: homeRef },
      { id: "track", ref: trackRef },
      { id: "services", ref: servicesRef },
      { id: "store", ref: storeRef },
      { id: "brands", ref: brandsRef },
      { id: "about", ref: aboutRef },
      { id: "contact", ref: contactRef },
      { id: "blogs", ref: blogsRef },
      { id: "auth", ref: authRef },
      { id: "admin", ref: adminRef },
    ];

    const els = entries.map((e) => e.ref.current).filter(Boolean);
    if (els.length === 0) return undefined;

    const observer = new IntersectionObserver(
      (obsEntries) => {
        const visible = obsEntries
          .filter((x) => x.isIntersecting)
          .sort((a, b) => (b.intersectionRatio || 0) - (a.intersectionRatio || 0))[0];
        if (!visible) return;
        const id = visible.target.getAttribute("data-section-id");
        if (id) setActiveSection(id);
      },
      { root: null, threshold: [0.2, 0.35, 0.5, 0.65] },
    );

    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  const bookingErrors = useMemo(() => {
    const e = {};
    const name = String(booking.name || "").trim();
    const phone = normalizeBookingPhone(booking.phone);
    const pincode = String(booking.pincode || "").trim();

    if (!name) e.name = "Name is required.";
    if (!phone) e.phone = "Phone number is required.";
    if (phone && !isValidBookingPhone(phone)) e.phone = "Phone number must be exactly 10 digits.";
    if (!pincode) e.pincode = "Pincode is required.";
    if (pincode && !isValidPincode(pincode)) e.pincode = "Pincode must be 6 digits.";
    return e;
  }, [booking]);

  const isPincodeValidNow = isValidPincode(booking.pincode);
  const canBook = Object.keys(bookingErrors).length === 0 && bookingStatus.state !== "loading" && isPincodeValidNow;

  const onBookingChange = (key, value) => {
    setBooking((prev) => ({ ...prev, [key]: value }));
    if (key === "pincode") {
      setPincodeStatus({ state: "idle", valid: null, message: "" });
    }
  };

  const markBookingTouched = (key) => setBookingTouched((prev) => ({ ...prev, [key]: true }));

  const checkPincode = async () => {
    const pin = String(booking.pincode || "").trim();
    setBookingTouched((prev) => ({ ...prev, pincode: true }));

    if (!isValidPincode(pin)) {
      setPincodeStatus({ state: "done", valid: false, message: "Please enter a valid 6-digit pincode." });
      return;
    }

    setPincodeStatus({ state: "checking", valid: null, message: "Checking service availability…" });
    try {
      const resp = await fetchJson(`/api/pincode/check?pincode=${encodeURIComponent(pin)}`);
      setPincodeStatus({ state: "done", valid: !!resp?.valid, message: resp?.message || "" });
    } catch (err) {
      setPincodeStatus({
        state: "done",
        valid: false,
        message: err?.message || "Unable to validate pincode right now.",
      });
    }
  };

  const submitBooking = async (e) => {
    e.preventDefault();
    setBookingTouched({ name: true, phone: true, pincode: true });

    if (Object.keys(bookingErrors).length > 0) {
      setBookingStatus({ state: "error", message: "Please fix the highlighted fields." });
      return;
    }

    // If we already checked and it failed, don't submit.
    if (pincodeStatus.state === "done" && pincodeStatus.valid === false) {
      setBookingStatus({ state: "error", message: "Please enter a serviceable pincode." });
      return;
    }

    setBookingStatus({ state: "loading", message: "Booking…" });
    try {
      const payload = {
        name: String(booking.name || "").trim(),
        phone: normalizeBookingPhone(booking.phone),
        pincode: String(booking.pincode || "").trim(),
      };
      const resp = await fetchJson("/api/bookings", { method: "POST", body: JSON.stringify(payload) });

      const bookingId = resp?.id;
      const nextUrl = resp?.next_step?.url;

      setBookingStatus({
        state: "success",
        message:
          bookingId != null
            ? `Booking received. Your Booking ID is #${bookingId}. Redirecting…`
            : resp?.message || "Booking received! Our team will contact you shortly.",
      });

      // Redirect into the new device selection flow (step 1: brand).
      // Prefer server-provided `next_step.url` to keep client/server in sync.
      if (bookingId != null) {
        window.setTimeout(() => {
          if (typeof nextUrl === "string" && nextUrl.trim()) {
            navigate(nextUrl);
          } else {
            navigate(`/booking/${bookingId}/brand`);
          }
        }, 700);
      }

      setBooking({ name: "", phone: "", pincode: "" });
      setBookingTouched({});
      setPincodeStatus({ state: "idle", valid: null, message: "" });
    } catch (err) {
      setBookingStatus({
        state: "error",
        message: err?.message || "Something went wrong. Please try again in a moment.",
      });
    }
  };

  const servicesFallback = useMemo(
    () => [
      { title: "Display Repair", description: "Cracked or flickering screens replaced with warranty support.", icon: "📱" },
      { title: "Battery", description: "Fix battery drain and swelling issues with reliable cells.", icon: "🔋" },
      { title: "Camera", description: "Blurry lens, focus issues, and camera module replacement.", icon: "📷" },
      { title: "Charging Port", description: "Port cleaning or replacement for loose/failed charging.", icon: "🔌" },
      { title: "Speaker", description: "Low sound, distortion, and mic/speaker diagnostics.", icon: "🔊" },
      { title: "Software", description: "Boot loops, updates, backups, and performance troubleshooting.", icon: "🧠" },
    ],
    [],
  );

  const servicesToRender = services.length > 0 ? services : servicesFallback;

  const sliderSlides = useMemo(
    () => [
      { id: "s1", accent: "pink", heading: "6 Months Warranty on Displays", sub: "Premium quality parts & expert installation" },
      { id: "s2", accent: "violet", heading: "Fast Doorstep Repairs", sub: "Book in seconds, we’ll do the rest" },
      { id: "s3", accent: "cyan", heading: "Trusted by 1,25,000+ Customers", sub: "Transparent pricing & real-time updates" },
    ],
    [],
  );

  const currentSlide = sliderSlides[clamp(sliderIndex, 0, sliderSlides.length - 1)];

  const submitTracking = async (e) => {
    e.preventDefault();
    const raw = String(trackInput || "").trim();
    if (!raw) {
      setTrackState({ state: "error", message: "Please enter a Booking ID or phone number.", booking: null });
      return;
    }

    setTrackState({ state: "loading", message: "Checking status…", booking: null });
    try {
      const qs =
        trackMode === "booking_id"
          ? `booking_id=${encodeURIComponent(raw)}`
          : `phone=${encodeURIComponent(normalizePhone(raw))}`;
      const resp = await fetchJson(`/api/track?${qs}`);
      setTrackState({
        state: "done",
        message: resp?.message || (resp?.found ? "Booking found." : "No booking found."),
        booking: resp?.booking || null,
      });
    } catch (err) {
      setTrackState({ state: "error", message: err?.message || "Unable to track status right now.", booking: null });
    }
  };

  const adminLogin = async (e) => {
    e.preventDefault();
    setAdminStatus({ state: "loading", message: "" });
    try {
      const payload = {
        username: String(adminCreds.username || "").trim(),
        password: String(adminCreds.password || "").trim(),
      };
      const resp = await fetchJson("/api/admin/login", { method: "POST", body: JSON.stringify(payload) });
      setAdminToken(resp?.token || "");
      setAdminStatus({ state: "success", message: "Logged in." });
    } catch (err) {
      setAdminToken("");
      setAdminBookings([]);
      setAdminStatus({ state: "error", message: err?.message || "Login failed." });
    }
  };

  const loadAdminBookings = async () => {
    if (!adminToken) {
      setAdminStatus({ state: "error", message: "Please login first." });
      return;
    }
    setAdminStatus({ state: "loading", message: "" });
    try {
      const resp = await fetchJson("/api/admin/bookings?limit=200", {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      setAdminBookings(Array.isArray(resp?.bookings) ? resp.bookings : []);
      setAdminStatus({ state: "success", message: "" });
    } catch (err) {
      setAdminBookings([]);
      setAdminStatus({ state: "error", message: err?.message || "Unable to load bookings." });
    }
  };

  const updateAdminBookingStatus = async (bookingId, status, notes) => {
    if (!adminToken) return;
    try {
      const resp = await fetchJson(`/api/admin/bookings/${bookingId}/status`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ status, notes }),
      });
      const updated = resp?.booking;
      if (!updated) return;

      setAdminBookings((prev) => prev.map((b) => (b.id === bookingId ? updated : b)));
    } catch (err) {
      setAdminStatus({ state: "error", message: err?.message || "Failed to update status." });
    }
  };

  const whatsappHref = useMemo(() => {
    // In production, this should be configured. Here we use the contact number from earlier template.
    const phoneDigits = "15551234567";
    const message = encodeURIComponent("Hi! I want to book a mobile repair. Please help.");
    return `https://wa.me/${phoneDigits}?text=${message}`;
  }, []);

  return (
    <div className="App">
      <a className="SkipLink" href="#main">
        Skip to content
      </a>

      {/* Floating action buttons */}
      <a className="Fab FabWhatsApp" href={whatsappHref} target="_blank" rel="noreferrer" aria-label="Chat on WhatsApp">
        WA
      </a>
      <a className="Fab FabCall" href="tel:+15551234567" aria-label="Call now">
        Call
      </a>

      <TopInfoBar
        phone="+1 (555) 123-4567"
        phoneHref="tel:+15551234567"
        email="support@example.com"
        emailHref="mailto:support@example.com"
        hours="Mon–Sat 9am–7pm"
        social={{
          instagram: "https://instagram.com",
          facebook: "https://facebook.com",
          youtube: "https://youtube.com",
        }}
      />

      {/* NAVBAR */}
      <header className="Header">
        <div className="Header-inner Container">
          <button type="button" className="Brand" role="banner" onClick={() => scrollToSection("home")} aria-label="Go to home">
            <div className="Brand-mark" aria-hidden="true">
              MS
            </div>
            <div className="Brand-text">
              <div className="Brand-title">Mobile Service</div>
              <div className="Brand-subtitle">Black • Blue • White</div>
            </div>
          </button>

          <button
            type="button"
            className="NavToggle"
            aria-label={navOpen ? "Close menu" : "Open menu"}
            aria-expanded={navOpen}
            onClick={() => setNavOpen((v) => !v)}
          >
            <span className="NavToggleBars" aria-hidden="true" />
          </button>

          <nav className={`Nav ${navOpen ? "is-open" : ""}`} aria-label="Primary">
            {sections.map((s) => (
              <button
                key={s.id}
                type="button"
                className={`NavLink ${activeSection === s.id ? "is-active" : ""}`}
                onClick={() => scrollToSection(s.id)}
              >
                {s.label}
              </button>
            ))}
            <button type="button" className="NavCTA" onClick={() => scrollToSection("home")}>
              Book Now
            </button>
          </nav>
        </div>
      </header>

      <main id="main" className="Main">
        {/* HOME / HERO */}
        <section ref={homeRef} data-section-id="home" className="Section Hero">
          <div className="Container Hero-grid">
            <div className="Hero-copy">
              <div className="HeroKicker">Fast, safe and reliable repair</div>

              <div className="HeroSlider" aria-label="Smartphone slider">
                <div className="HeroSlider-inner">
                  <div className={`HeroSlide HeroSlide-${currentSlide.accent}`} key={currentSlide.id}>
                    <div className="HeroSlide-copy">
                      <div className="HeroSlide-eyebrow">Special offer</div>
                      <h1 className="HeroTitle">{currentSlide.heading}</h1>
                      <p className="HeroSubtitle">{currentSlide.sub}</p>
                      <div className="HeroSlide-dots" aria-label="Slider controls">
                        {sliderSlides.map((sl, idx) => (
                          <button
                            key={sl.id}
                            type="button"
                            className={`DotBtn ${idx === sliderIndex ? "is-active" : ""}`}
                            aria-label={`Go to slide ${idx + 1}`}
                            onClick={() => setSliderIndex(idx)}
                          />
                        ))}
                      </div>
                    </div>

                    <div className="HeroSlide-visual" aria-hidden="true">
                      <div className="PhoneFrame">
                        <div className="PhoneNotch" />
                        <div className="PhoneScreen" />
                      </div>
                      <div className="PhoneGlow" />
                    </div>
                  </div>
                </div>
              </div>

              {/* STATS */}
              <div className="StatsRow" aria-label="Stats">
                <div className="StatCard">
                  <div className="StatValue">4.7/5</div>
                  <div className="StatLabel">Rating</div>
                </div>
                <div className="StatCard">
                  <div className="StatValue">1,25,000+</div>
                  <div className="StatLabel">Customers</div>
                </div>
                <div className="StatCard">
                  <div className="StatValue">7,000+</div>
                  <div className="StatLabel">Devices repaired</div>
                </div>
              </div>
            </div>

            {/* BOOKING FORM CARD */}
            <div className="Hero-card" aria-label="Booking form">
              <div className="GlassCard BookingCard">
                <div className="GlassHeader">
                  <div className="GlassTitle">Book a Repair</div>
                  <div className="GlassBadge Pink">Fast booking</div>
                </div>

                <form className="Form" onSubmit={submitBooking} noValidate>
                  <div className="FieldGrid">
                    <label className="Field">
                      <span className="FieldLabel">Name</span>
                      <input
                        ref={bookingNameRef}
                        className={`Input ${bookingTouched.name && bookingErrors.name ? "InputError" : ""}`}
                        value={booking.name}
                        onChange={(e) => onBookingChange("name", e.target.value)}
                        onBlur={() => markBookingTouched("name")}
                        onFocus={(e) => flashFocus(e.currentTarget)}
                        onKeyDown={handleBookingKeyDown("name")}
                        placeholder="Your name"
                        autoComplete="name"
                        enterKeyHint="next"
                      />
                      {bookingTouched.name && bookingErrors.name ? <span className="FieldError">{bookingErrors.name}</span> : null}
                    </label>

                    <label className="Field">
                      <span className="FieldLabel">Phone Number</span>
                      <input
                        ref={bookingPhoneRef}
                        className={`Input ${bookingTouched.phone && bookingErrors.phone ? "InputError" : ""}`}
                        value={booking.phone}
                        onChange={(e) => onBookingChange("phone", normalizeBookingPhone(e.target.value))}
                        onPaste={(e) => {
                          // Block pasting any content that isn't strictly numeric (requirement).
                          const text = e.clipboardData?.getData("text") ?? "";
                          if (!/^\d+$/.test(text)) {
                            e.preventDefault();
                            setBookingTouched((prev) => ({ ...prev, phone: true }));
                          }
                        }}
                        onBlur={() => markBookingTouched("phone")}
                        onFocus={(e) => flashFocus(e.currentTarget)}
                        onKeyDown={handleBookingKeyDown("phone")}
                        placeholder="10-digit phone number"
                        autoComplete="tel"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        maxLength={10}
                        enterKeyHint="next"
                      />
                      {bookingTouched.phone && bookingErrors.phone ? <span className="FieldError">{bookingErrors.phone}</span> : null}
                    </label>

                    <div className="Field FieldSpan2">
                      <div className="FieldRow">
                        <label className="Field FieldRowField">
                          <span className="FieldLabel">Pincode</span>
                          <input
                            ref={bookingPincodeRef}
                            className={`Input ${
                              bookingTouched.pincode && (bookingErrors.pincode || pincodeStatus.valid === false) ? "InputError" : ""
                            }`}
                            value={booking.pincode}
                            onChange={(e) => onBookingChange("pincode", normalizeBookingPincode(e.target.value))}
                            onPaste={(e) => {
                              const text = e.clipboardData?.getData("text") ?? "";
                              // Numeric-only; if pasted content contains non-digits, block paste.
                              if (!/^\d+$/.test(text)) {
                                e.preventDefault();
                                setBookingTouched((prev) => ({ ...prev, pincode: true }));
                              }
                            }}
                            onBlur={() => markBookingTouched("pincode")}
                            onFocus={(e) => flashFocus(e.currentTarget)}
                            onKeyDown={handleBookingKeyDown("pincode")}
                            placeholder="6-digit pincode"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            autoComplete="postal-code"
                            maxLength={6}
                            enterKeyHint="go"
                          />
                        </label>

                        <button
                          ref={bookingCheckBtnRef}
                          type="button"
                          className="Button Secondary CheckBtn"
                          onClick={checkPincode}
                          aria-label="Check pincode"
                          disabled={!isValidPincode(booking.pincode) || pincodeStatus.state === "checking"}
                        >
                          {pincodeStatus.state === "checking" ? "Checking…" : "Check"}
                        </button>
                      </div>

                      {bookingTouched.pincode && bookingErrors.pincode ? <span className="FieldError">{bookingErrors.pincode}</span> : null}

                      {pincodeStatus.state === "done" ? (
                        <div className={`PincodeMsg ${pincodeStatus.valid ? "is-ok" : "is-bad"}`}>{pincodeStatus.message}</div>
                      ) : null}
                    </div>
                  </div>

                  <div className="FormFooter">
                    <button
                      ref={bookingSubmitBtnRef}
                      type="submit"
                      className="Button Primary PinkPrimary"
                      disabled={!canBook}
                      onFocus={(e) => flashFocus(e.currentTarget)}
                    >
                      {bookingStatus.state === "loading" ? "Booking…" : "Book Now"}
                    </button>

                    <div
                      className={`FormStatus ${
                        bookingStatus.state === "success" ? "is-success" : bookingStatus.state === "error" ? "is-error" : ""
                      }`}
                      role={bookingStatus.state === "error" ? "alert" : "status"}
                      aria-live="polite"
                    >
                      {bookingStatus.message}
                    </div>
                  </div>

                  <div className="FormHint">We’ll call you shortly to confirm slot & estimate.</div>
                </form>
              </div>
            </div>
          </div>
        </section>

        {/* TRACK STATUS */}
        <section ref={trackRef} data-section-id="track" className="Section SectionDark">
          <div className="Container">
            <div className="SectionHeader">
              <h2 className="H2">Track Status</h2>
              <p className="Subhead">Enter your Booking ID or Phone number to see repair progress.</p>
            </div>

            <div className="TrackCard">
              <form className="TrackForm" onSubmit={submitTracking}>
                <div className="TrackTabs" role="tablist" aria-label="Track mode">
                  <button
                    type="button"
                    className={`TrackTab ${trackMode === "booking_id" ? "is-active" : ""}`}
                    onClick={() => setTrackMode("booking_id")}
                  >
                    Booking ID
                  </button>
                  <button
                    type="button"
                    className={`TrackTab ${trackMode === "phone" ? "is-active" : ""}`}
                    onClick={() => setTrackMode("phone")}
                  >
                    Phone
                  </button>
                </div>

                <div className="TrackRow">
                  <input
                    className="Input"
                    value={trackInput}
                    onChange={(e) => setTrackInput(e.target.value)}
                    placeholder={trackMode === "booking_id" ? "Enter booking id (e.g. 123)" : "Enter phone number"}
                    inputMode={trackMode === "booking_id" ? "numeric" : "tel"}
                  />
                  <button type="submit" className="Button Primary PinkPrimary">
                    {trackState.state === "loading" ? "Checking…" : "Track"}
                  </button>
                </div>

                <div
                  className={`TrackMsg ${trackState.state === "error" ? "is-error" : trackState.state === "done" ? "is-done" : ""}`}
                  role={trackState.state === "error" ? "alert" : "status"}
                  aria-live="polite"
                >
                  {trackState.message}
                </div>

                {trackState.booking ? (
                  <div className="TrackResult">
                    <div className="TrackBadgeRow">
                      <div className={`StatusBadge Status-${formatStatus(trackState.booking.status).replace(/\s/g, "")}`}>
                        {formatStatus(trackState.booking.status)}
                      </div>
                      <div className="TrackMeta">
                        Booking #{trackState.booking.id} • {trackState.booking.created_at}
                      </div>
                    </div>

                    <div className="TrackGrid">
                      <div className="TrackItem">
                        <div className="TrackLabel">Name</div>
                        <div className="TrackValue">{trackState.booking.name}</div>
                      </div>
                      <div className="TrackItem">
                        <div className="TrackLabel">Phone</div>
                        <div className="TrackValue">{trackState.booking.phone}</div>
                      </div>
                      <div className="TrackItem">
                        <div className="TrackLabel">Pincode</div>
                        <div className="TrackValue">{trackState.booking.pincode}</div>
                      </div>
                      <div className="TrackItem TrackSpan2">
                        <div className="TrackLabel">Notes</div>
                        <div className="TrackValue">{trackState.booking.notes || "—"}</div>
                      </div>
                    </div>
                  </div>
                ) : null}
              </form>

              <div className="FormHint">
                Tip: After booking, your Booking ID is shown in the success message. Admin updates status in the Admin Panel.
              </div>
            </div>
          </div>
        </section>

        {/* SERVICES */}
        <section ref={servicesRef} data-section-id="services" className="Section">
          <div className="Container">
            <div className="SectionHeader">
              <h2 className="H2">Services</h2>
              <p className="Subhead">Display, Battery, Camera, Charging Port, Speaker, Software.</p>
            </div>

            {loadingServices ? (
              <div className="Grid">
                {[0, 1, 2, 3, 4, 5].map((k) => (
                  <div key={k} className="Card Skeleton" aria-hidden="true" />
                ))}
              </div>
            ) : (
              <div className="Grid ServicesGrid">
                {servicesToRender.map((s) => (
                  <article key={s.id || s.title} className="Card Lift ServiceCard">
                    <div className="CardTop">
                      <div className="IconCircle" aria-hidden="true">
                        {s.icon || "🛠"}
                      </div>
                      <div className="CardTitle">{s.title}</div>
                    </div>
                    <div className="CardText">{s.description}</div>
                    {s.price_hint ? <div className="PriceHint">{s.price_hint}</div> : null}
                  </article>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* STORE LOCATOR */}
        <section ref={storeRef} data-section-id="store" className="Section Alt">
          <div className="Container">
            <div className="SectionHeader">
              <h2 className="H2">Store Locator</h2>
              <p className="Subhead">Find nearby service centers (map + city list).</p>
            </div>

            <div className="StoreGrid">
              <div className="StoreList Card Lift">
                <div className="CardTitle">Cities</div>
                <div className="CardText">Select a city (demo list):</div>
                <div className="CityList">
                  {["New York", "Los Angeles", "Chicago", "Houston", "Phoenix"].map((c) => (
                    <div key={c} className="CityChip">
                      {c}
                    </div>
                  ))}
                </div>
                <div className="FormHint">Map is embedded for layout parity; wire to real locations API as needed.</div>
              </div>

              <div className="StoreMap Card Lift">
                <div className="CardTitle">Map</div>
                <StoreLocatorMap />
              </div>
            </div>
          </div>
        </section>

        {/* BRANDS */}
        <section ref={brandsRef} data-section-id="brands" className="Section">
          <div className="Container">
            <div className="SectionHeader">
              <h2 className="H2">Brands</h2>
              <p className="Subhead">Apple, Samsung, Vivo, Oppo, Xiaomi and more.</p>
            </div>

            <div className="ChipRow" aria-label="Brands">
              {["Apple", "Samsung", "Vivo", "Oppo", "Xiaomi", "OnePlus", "Realme", "Google"].map((b) => (
                <div key={b} className="Chip">
                  {b}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ABOUT */}
        <section ref={aboutRef} data-section-id="about" className="Section SectionDark">
          <div className="Container">
            <div className="SectionHeader">
              <h2 className="H2">About Us</h2>
              <p className="Subhead">Professional repairs with modern service and transparent support.</p>
            </div>

            <div className="Split">
              <div className="Panel DarkPanel">
                <div className="PanelTitle">Why we’re different</div>
                <p className="PanelText">
                  We focus on fast diagnosis, high-quality parts, and clear communication—so you always know what’s happening and why.
                </p>
                <ul className="Bullets">
                  {["6-month warranty on displays", "Doorstep pickup & delivery options", "Trusted technicians"].map((b) => (
                    <li key={b} className="Bullet">
                      <span className="Check CheckDark" aria-hidden="true">
                        ✓
                      </span>
                      {b}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="Panel AccentPink">
                <div className="PanelTitle">Ready to book?</div>
                <p className="PanelText">Use the booking form above to get started. We validate pincodes and respond quickly.</p>
                <button type="button" className="Button Primary PinkPrimary" onClick={() => scrollToSection("home")}>
                  Book Now
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* CONTACT */}
        <section ref={contactRef} data-section-id="contact" className="Section">
          <div className="Container">
            <div className="SectionHeader">
              <h2 className="H2">Contact</h2>
              <p className="Subhead">Contact us or send a request. We’re here to help.</p>
            </div>

            <div className="ContactGrid2">
              <div className="Card Lift">
                <div className="CardTitle">Contact Us</div>
                <div className="CardText">Fill the form and we’ll get back to you.</div>

                <form
                  className="ContactForm"
                  onSubmit={(e) => {
                    e.preventDefault();
                    // This repo already has /api/submit_form support; keep the UI minimal here.
                    // A future enhancement: wire full form submission with fields requested.
                    alert("Thanks! Please use the booking form above for fastest response.");
                  }}
                >
                  <div className="FieldGrid">
                    <label className="Field">
                      <span className="FieldLabel">Name</span>
                      <input className="Input" placeholder="Your name" />
                    </label>
                    <label className="Field">
                      <span className="FieldLabel">Phone</span>
                      <input className="Input" placeholder="Phone number" inputMode="tel" />
                    </label>
                    <label className="Field FieldSpan2">
                      <span className="FieldLabel">Message</span>
                      <textarea className="Input TextArea" placeholder="How can we help?" rows={4} />
                    </label>
                  </div>
                  <button type="submit" className="Button Primary PinkPrimary">
                    Send
                  </button>
                </form>
              </div>

              <div className="Card Lift">
                <div className="CardTitle">Google Map</div>
                <div className="MapWrap" aria-label="Google Map">
                  <iframe
                    title="Contact map"
                    src="https://www.google.com/maps?q=New%20York&output=embed"
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                  />
                </div>
                <div className="FormHint">
                  Phone: <a className="InlineLink" href="tel:+15551234567">+1 (555) 123-4567</a> • Email:{" "}
                  <a className="InlineLink" href="mailto:support@example.com">support@example.com</a>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* BLOGS */}
        <section ref={blogsRef} data-section-id="blogs" className="Section Alt">
          <div className="Container">
            <div className="SectionHeader">
              <h2 className="H2">Blogs</h2>
              <p className="Subhead">Tips & guides (placeholder content).</p>
            </div>
            <div className="Grid">
              {[1, 2, 3].map((n) => (
                <article key={n} className="Card Lift">
                  <div className="CardTitle">Repair tip #{n}</div>
                  <div className="CardText">Learn how to protect your device and spot issues early. (Placeholder.)</div>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* AUTH */}
        <section ref={authRef} data-section-id="auth" className="Section">
          <div className="Container">
            <div className="SectionHeader">
              <h2 className="H2">Login / Signup</h2>
              <p className="Subhead">Customer auth is a placeholder for this project scope.</p>
            </div>
            <div className="PlaceholderCard Lift">
              <div className="PlaceholderTitle">Authentication</div>
              <div className="PlaceholderText">If needed, integrate Supabase Auth or backend auth for customers.</div>
            </div>
          </div>
        </section>

        {/* ADMIN */}
        <section ref={adminRef} data-section-id="admin" className="Section SectionDark">
          <div className="Container">
            <div className="SectionHeader">
              <h2 className="H2">Admin Panel</h2>
              <p className="Subhead">Login, view bookings, and update repair status.</p>
            </div>

            <div className="AdminCard">
              <div className="AdminSplit">
                <form className="AdminLogin" onSubmit={adminLogin}>
                  <div className="AdminLoginTitle">Admin Login</div>
                  <label className="Field">
                    <span className="FieldLabel DarkLabel">Username</span>
                    <input
                      className="Input"
                      value={adminCreds.username}
                      onChange={(e) => setAdminCreds((p) => ({ ...p, username: e.target.value }))}
                      placeholder="admin"
                      autoComplete="username"
                    />
                  </label>
                  <label className="Field">
                    <span className="FieldLabel DarkLabel">Password</span>
                    <input
                      className="Input"
                      type="password"
                      value={adminCreds.password}
                      onChange={(e) => setAdminCreds((p) => ({ ...p, password: e.target.value }))}
                      placeholder="••••••••"
                      autoComplete="current-password"
                    />
                  </label>

                  <button type="submit" className="Button Primary PinkPrimary">
                    {adminStatus.state === "loading" ? "Logging in…" : "Login"}
                  </button>

                  <div className={`AdminNote ${adminStatus.state === "error" ? "is-error" : ""}`}>
                    {adminStatus.message || (adminToken ? "Token active." : "Set default admin in backend env to login.")}
                  </div>

                  <div className="FormHint">
                    Backend env (optional): <code>ADMIN_DEFAULT_USERNAME</code>, <code>ADMIN_DEFAULT_PASSWORD</code>,{" "}
                    <code>ADMIN_LOGIN_ENABLED=true</code>
                  </div>
                </form>

                <div className="AdminActions">
                  <div className="AdminBar">
                    <div className="AdminKeyField">
                      <span className="AdminKeyLabel">Session</span>
                      <input className="Input" value={adminToken} onChange={(e) => setAdminToken(e.target.value)} placeholder="Bearer token" />
                    </div>
                    <button type="button" className="Button Secondary" onClick={loadAdminBookings}>
                      {adminStatus.state === "loading" ? "Loading…" : "Load Bookings"}
                    </button>
                  </div>

                  {adminStatus.state === "error" ? <div className="AdminError">{adminStatus.message}</div> : null}

                  <div className="AdminTableWrap">
                    <table className="AdminTable">
                      <thead>
                        <tr>
                          <th>ID</th>
                          <th>Name</th>
                          <th>Phone</th>
                          <th>Pincode</th>
                          <th>Status</th>
                          <th>Update</th>
                        </tr>
                      </thead>
                      <tbody>
                        {adminBookings.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="AdminEmpty">
                              No bookings loaded yet.
                            </td>
                          </tr>
                        ) : (
                          adminBookings.map((b) => (
                            <AdminBookingRow key={b.id} booking={b} onUpdate={updateAdminBookingStatus} />
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>

                  <div className="FormHint">
                    Customer tracking API: <code>/api/track</code> • Admin update API: <code>/api/admin/bookings/:id/status</code>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <footer className="Footer FooterDark">
          <div className="Container FooterInner">
            <div className="FooterBrand">
              <div className="Brand-mark" aria-hidden="true">
                MS
              </div>
              <div>
                <div className="FooterTitle">Mobile Service</div>
                <div className="FooterText">Modern black/blue theme • Smooth animations • Responsive</div>
              </div>
            </div>

            <div className="FooterLinks" aria-label="Footer navigation">
              {sections.slice(0, 6).map((s) => (
                <button key={s.id} type="button" className="FooterLink FooterLinkDark" onClick={() => scrollToSection(s.id)}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}

// Small row component for admin table (kept inside App.js to avoid new component tree).
function AdminBookingRow({ booking, onUpdate }) {
  const [status, setStatus] = useState(formatStatus(booking.status));
  const [notes, setNotes] = useState(booking.notes || "");

  useEffect(() => {
    setStatus(formatStatus(booking.status));
    setNotes(booking.notes || "");
  }, [booking.status, booking.notes]);

  return (
    <tr>
      <td>{booking.id}</td>
      <td>{booking.name}</td>
      <td>{booking.phone}</td>
      <td>{booking.pincode}</td>
      <td>
        <select className="Select" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="Pending">Pending</option>
          <option value="In Progress">In Progress</option>
          <option value="Completed">Completed</option>
        </select>
      </td>
      <td>
        <div className="AdminUpdateCell">
          <input className="Input SmallInput" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (optional)" />
          <button
            type="button"
            className="Button Secondary SmallBtn"
            onClick={() => onUpdate(booking.id, status, notes)}
            aria-label={`Update booking ${booking.id}`}
          >
            Save
          </button>
        </div>
      </td>
    </tr>
  );
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<HomeShell />} />
      <Route path="/booking/:bookingId/:step" element={<BookingFlow />} />
      <Route path="*" element={<HomeShell />} />
    </Routes>
  );
}

export default App;
