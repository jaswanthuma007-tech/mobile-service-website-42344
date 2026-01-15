import React, { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";

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
  return String(phone || "").replace(/[^\d+]/g, "");
}

function isValidPincode(pincode) {
  return /^[0-9]{6}$/.test(String(pincode || "").trim());
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

// PUBLIC_INTERFACE
function App() {
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

  const [sliderIndex, setSliderIndex] = useState(0);

  const [adminKey, setAdminKey] = useState("");
  const [adminStatus, setAdminStatus] = useState({ state: "idle", message: "" }); // idle | loading | error
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

  // Slider auto-advance (simple smartphone image placeholders using gradients + "device" frame).
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
    const phone = normalizePhone(booking.phone);
    const pincode = String(booking.pincode || "").trim();

    if (!name) e.name = "Name is required.";
    if (!phone) e.phone = "Phone number is required.";
    if (phone && phone.replace(/\D/g, "").length < 7) e.phone = "Please enter a valid phone number.";
    if (!pincode) e.pincode = "Pincode is required.";
    if (pincode && !isValidPincode(pincode)) e.pincode = "Pincode must be 6 digits.";
    return e;
  }, [booking]);

  const canBook = Object.keys(bookingErrors).length === 0 && bookingStatus.state !== "loading";

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
        phone: normalizePhone(booking.phone),
        pincode: String(booking.pincode || "").trim(),
      };
      const resp = await fetchJson("/api/bookings", { method: "POST", body: JSON.stringify(payload) });
      setBookingStatus({
        state: "success",
        message: resp?.message || "Booking received! Our team will contact you shortly.",
      });
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

  const loadAdminBookings = async () => {
    setAdminStatus({ state: "loading", message: "" });
    try {
      const headers = adminKey ? { "X-Admin-Key": adminKey } : {};
      const resp = await fetchJson("/api/admin/bookings?limit=200", { headers });
      setAdminBookings(Array.isArray(resp?.bookings) ? resp.bookings : []);
      setAdminStatus({ state: "idle", message: "" });
    } catch (err) {
      setAdminBookings([]);
      setAdminStatus({ state: "error", message: err?.message || "Unable to load bookings." });
    }
  };

  const servicesFallback = useMemo(
    () => [
      { title: "Display Repair", description: "Cracked or flickering screens replaced with warranty support.", icon: "📱" },
      { title: "Battery", description: "Fix battery drain and swelling issues with reliable cells.", icon: "🔋" },
      { title: "Charging Port", description: "Port cleaning or replacement for loose/failed charging.", icon: "🔌" },
      { title: "Software", description: "Boot loops, updates, backups, and performance troubleshooting.", icon: "🧠" },
      { title: "Camera", description: "Blurry lens, focus issues, and camera module replacement.", icon: "📷" },
      { title: "Speaker", description: "Low sound, distortion, and mic/speaker diagnostics.", icon: "🔊" },
    ],
    [],
  );

  const servicesToRender = services.length > 0 ? services : servicesFallback;

  const sliderSlides = useMemo(
    () => [
      { id: "s1", accent: "pink", heading: "6 Months Warranty on iPhone Displays", sub: "Premium quality parts & expert installation" },
      { id: "s2", accent: "violet", heading: "Fast Doorstep Repairs", sub: "Book in seconds, we’ll do the rest" },
      { id: "s3", accent: "cyan", heading: "Trusted by 1,25,000+ Customers", sub: "Transparent pricing & real-time updates" },
    ],
    [],
  );

  const currentSlide = sliderSlides[clamp(sliderIndex, 0, sliderSlides.length - 1)];

  return (
    <div className="App">
      <a className="SkipLink" href="#main">
        Skip to content
      </a>

      {/* TOP HEADER (dark) */}
      <div className="TopHeader" role="note" aria-label="Contact quick info">
        <div className="Container TopHeader-inner">
          <div className="TopHeader-left">
            <a className="TopHeader-link" href="tel:+15551234567">
              <span className="TopHeader-ico" aria-hidden="true">
                ☎
              </span>
              +1 (555) 123-4567
            </a>
            <a className="TopHeader-link" href="mailto:support@example.com">
              <span className="TopHeader-ico" aria-hidden="true">
                ✉
              </span>
              support@example.com
            </a>
            <div className="TopHeader-item">
              <span className="TopHeader-ico" aria-hidden="true">
                ⏱
              </span>
              Mon–Sat 9am–7pm
            </div>
          </div>

          <div className="TopHeader-right" aria-label="Social links">
            <button type="button" className="TopHeader-social" aria-label="Instagram">
              IG
            </button>
            <button type="button" className="TopHeader-social" aria-label="Facebook">
              FB
            </button>
            <button type="button" className="TopHeader-social" aria-label="YouTube">
              YT
            </button>
          </div>
        </div>
      </div>

      {/* NAVBAR */}
      <header className="Header">
        <div className="Header-inner Container">
          <button
            type="button"
            className="Brand"
            role="banner"
            onClick={() => scrollToSection("home")}
            aria-label="Go to home"
          >
            <div className="Brand-mark" aria-hidden="true">
              MS
            </div>
            <div className="Brand-text">
              <div className="Brand-title">Mobile Service</div>
              <div className="Brand-subtitle">Black • Pink • White</div>
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
                        className={`Input ${bookingTouched.name && bookingErrors.name ? "InputError" : ""}`}
                        value={booking.name}
                        onChange={(e) => onBookingChange("name", e.target.value)}
                        onBlur={() => markBookingTouched("name")}
                        placeholder="Your name"
                        autoComplete="name"
                      />
                      {bookingTouched.name && bookingErrors.name ? (
                        <span className="FieldError">{bookingErrors.name}</span>
                      ) : null}
                    </label>

                    <label className="Field">
                      <span className="FieldLabel">Phone Number</span>
                      <input
                        className={`Input ${bookingTouched.phone && bookingErrors.phone ? "InputError" : ""}`}
                        value={booking.phone}
                        onChange={(e) => onBookingChange("phone", e.target.value)}
                        onBlur={() => markBookingTouched("phone")}
                        placeholder="+1 555 123 4567"
                        autoComplete="tel"
                        inputMode="tel"
                      />
                      {bookingTouched.phone && bookingErrors.phone ? (
                        <span className="FieldError">{bookingErrors.phone}</span>
                      ) : null}
                    </label>

                    <div className="Field FieldSpan2">
                      <div className="FieldRow">
                        <label className="Field FieldRowField">
                          <span className="FieldLabel">Pincode</span>
                          <input
                            className={`Input ${
                              bookingTouched.pincode && (bookingErrors.pincode || pincodeStatus.valid === false)
                                ? "InputError"
                                : ""
                            }`}
                            value={booking.pincode}
                            onChange={(e) => onBookingChange("pincode", e.target.value)}
                            onBlur={() => markBookingTouched("pincode")}
                            placeholder="6-digit pincode"
                            inputMode="numeric"
                            autoComplete="postal-code"
                            maxLength={6}
                          />
                        </label>

                        <button type="button" className="Button Secondary CheckBtn" onClick={checkPincode}>
                          {pincodeStatus.state === "checking" ? "Checking…" : "Check"}
                        </button>
                      </div>

                      {bookingTouched.pincode && bookingErrors.pincode ? (
                        <span className="FieldError">{bookingErrors.pincode}</span>
                      ) : null}

                      {pincodeStatus.state === "done" ? (
                        <div className={`PincodeMsg ${pincodeStatus.valid ? "is-ok" : "is-bad"}`}>
                          {pincodeStatus.message}
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div className="FormFooter">
                    <button type="submit" className="Button Primary PinkPrimary" disabled={!canBook}>
                      {bookingStatus.state === "loading" ? "Booking…" : "Book Now"}
                    </button>

                    <div
                      className={`FormStatus ${
                        bookingStatus.state === "success"
                          ? "is-success"
                          : bookingStatus.state === "error"
                            ? "is-error"
                            : ""
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
              <p className="Subhead">Coming soon: Track your repair progress with your booking ID.</p>
            </div>

            <div className="PlaceholderCard LiftDark">
              <div className="PlaceholderTitle">Feature in progress</div>
              <div className="PlaceholderText">
                We can show real-time updates once tracking is enabled in the backend.
              </div>
            </div>
          </div>
        </section>

        {/* SERVICES */}
        <section ref={servicesRef} data-section-id="services" className="Section">
          <div className="Container">
            <div className="SectionHeader">
              <h2 className="H2">Services</h2>
              <p className="Subhead">Display Repair, Battery, Charging Port, Software, Camera, Speaker.</p>
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
                        {s.icon || "🔧"}
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
              <p className="Subhead">Find your nearest center (placeholder section).</p>
            </div>
            <div className="PlaceholderCard Lift">
              <div className="PlaceholderTitle">Add locations</div>
              <div className="PlaceholderText">This can be wired to a locations API in the backend.</div>
            </div>
          </div>
        </section>

        {/* BRANDS */}
        <section ref={brandsRef} data-section-id="brands" className="Section">
          <div className="Container">
            <div className="SectionHeader">
              <h2 className="H2">Brands</h2>
              <p className="Subhead">We service popular brands (placeholder chips).</p>
            </div>

            <div className="ChipRow" aria-label="Brands">
              {["Apple", "Samsung", "OnePlus", "Xiaomi", "Google", "Vivo", "Oppo"].map((b) => (
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
                  We focus on fast diagnosis, high-quality parts, and clear communication—so you always know what’s
                  happening and why.
                </p>
                <ul className="Bullets">
                  {["6-month warranty on iPhone displays", "Doorstep pickup & delivery options", "Trusted technicians"].map(
                    (b) => (
                      <li key={b} className="Bullet">
                        <span className="Check CheckDark" aria-hidden="true">
                          ✓
                        </span>
                        {b}
                      </li>
                    ),
                  )}
                </ul>
              </div>

              <div className="Panel AccentPink">
                <div className="PanelTitle">Ready to book?</div>
                <p className="PanelText">
                  Use the booking form above to get started. We validate pincodes and respond quickly.
                </p>
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
              <p className="Subhead">Call, email, or book online. We’re here to help.</p>
            </div>

            <div className="ContactGrid">
              <div className="Card Lift">
                <div className="CardTitle">Working Hours</div>
                <div className="CardText">Mon–Sat: 9am–7pm</div>
              </div>
              <div className="Card Lift">
                <div className="CardTitle">Phone</div>
                <div className="CardText">+1 (555) 123-4567</div>
                <a className="InlineLink" href="tel:+15551234567">
                  Call now
                </a>
              </div>
              <div className="Card Lift">
                <div className="CardTitle">Email</div>
                <div className="CardText">support@example.com</div>
                <a className="InlineLink" href="mailto:support@example.com">
                  Email us
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* BLOGS */}
        <section ref={blogsRef} data-section-id="blogs" className="Section Alt">
          <div className="Container">
            <div className="SectionHeader">
              <h2 className="H2">Blogs</h2>
              <p className="Subhead">Tips & guides (placeholder section).</p>
            </div>
            <div className="Grid">
              {[1, 2, 3].map((n) => (
                <article key={n} className="Card Lift">
                  <div className="CardTitle">Repair tip #{n}</div>
                  <div className="CardText">
                    Learn how to protect your device and spot issues early. (This is placeholder content.)
                  </div>
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
              <p className="Subhead">Placeholder section (auth not implemented in this project).</p>
            </div>
            <div className="PlaceholderCard Lift">
              <div className="PlaceholderTitle">Authentication</div>
              <div className="PlaceholderText">
                If you want real login/signup, we can integrate Supabase Auth or a backend auth system.
              </div>
            </div>
          </div>
        </section>

        {/* ADMIN */}
        <section ref={adminRef} data-section-id="admin" className="Section SectionDark">
          <div className="Container">
            <div className="SectionHeader">
              <h2 className="H2">Admin Panel</h2>
              <p className="Subhead">View customer booking submissions (simple table).</p>
            </div>

            <div className="AdminCard">
              <div className="AdminBar">
                <label className="AdminKeyField">
                  <span className="AdminKeyLabel">X-Admin-Key (optional)</span>
                  <input
                    className="Input"
                    value={adminKey}
                    onChange={(e) => setAdminKey(e.target.value)}
                    placeholder="Enter admin key if enabled"
                    autoComplete="off"
                  />
                </label>
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
                      <th>Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {adminBookings.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="AdminEmpty">
                          No bookings loaded yet.
                        </td>
                      </tr>
                    ) : (
                      adminBookings.map((b) => (
                        <tr key={b.id}>
                          <td>{b.id}</td>
                          <td>{b.name}</td>
                          <td>{b.phone}</td>
                          <td>{b.pincode}</td>
                          <td>{b.created_at}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div className="FormHint">
                Admin endpoint: <code>/api/admin/bookings</code>. If backend sets <code>ADMIN_API_KEY</code>, provide it
                in <code>X-Admin-Key</code>.
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
                <div className="FooterText">Modern black/pink theme • Smooth animations • Responsive</div>
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

export default App;
