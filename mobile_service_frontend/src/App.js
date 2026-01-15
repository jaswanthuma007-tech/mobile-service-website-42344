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

function isValidEmail(email) {
  // Pragmatic email validation for UX (backend should also validate).
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
}

function normalizePhone(phone) {
  return String(phone || "").replace(/[^\d+]/g, "");
}

// PUBLIC_INTERFACE
function App() {
  const sections = useMemo(
    () => [
      { id: "home", label: "Home" },
      { id: "services", label: "Services" },
      { id: "about", label: "About" },
      { id: "contact", label: "Contact" },
    ],
    [],
  );

  const [activeSection, setActiveSection] = useState("home");

  const [services, setServices] = useState([]);
  const [about, setAbout] = useState(null);
  const [contact, setContact] = useState(null);

  const [loadingServices, setLoadingServices] = useState(false);
  const [loadingAbout, setLoadingAbout] = useState(false);
  const [loadingContact, setLoadingContact] = useState(false);

  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    mobileModel: "",
    problem: "",
  });

  const [formTouched, setFormTouched] = useState({});
  const [formStatus, setFormStatus] = useState({ state: "idle", message: "" }); // idle | loading | success | error

  const homeRef = useRef(null);
  const servicesRef = useRef(null);
  const aboutRef = useRef(null);
  const contactRef = useRef(null);

  const refById = useMemo(
    () => ({
      home: homeRef,
      services: servicesRef,
      about: aboutRef,
      contact: contactRef,
    }),
    [],
  );

  // Smooth scroll to section.
  // PUBLIC_INTERFACE
  const scrollToSection = (id) => {
    const ref = refById[id];
    const el = ref?.current;
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const validate = (nextForm) => {
    const errors = {};
    const name = String(nextForm.name || "").trim();
    const email = String(nextForm.email || "").trim();
    const phone = normalizePhone(nextForm.phone);
    const mobileModel = String(nextForm.mobileModel || "").trim();
    const problem = String(nextForm.problem || "").trim();

    if (!name) errors.name = "Name is required.";
    if (!phone) errors.phone = "Phone is required.";
    if (phone && phone.replace(/\D/g, "").length < 7) errors.phone = "Please enter a valid phone number.";
    if (!email) errors.email = "Email is required.";
    if (email && !isValidEmail(email)) errors.email = "Please enter a valid email address.";
    if (!mobileModel) errors.mobileModel = "Mobile model is required.";
    if (!problem) errors.problem = "Please describe the problem.";
    if (problem && problem.length < 10) errors.problem = "Please add a bit more detail (min 10 characters).";

    return errors;
  };

  const errors = useMemo(() => validate(form), [form]);
  const hasErrors = Object.keys(errors).length > 0;

  // Load content from backend.
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoadingServices(true);
      setLoadingAbout(true);
      setLoadingContact(true);

      try {
        const [svc, abt, cnt] = await Promise.all([
          fetchJson("/api/services"),
          fetchJson("/api/about"),
          fetchJson("/api/contact"),
        ]);

        if (cancelled) return;

        setServices(Array.isArray(svc?.services) ? svc.services : []);
        setAbout(abt || null);
        setContact(cnt || null);
      } catch (e) {
        // If backend isn't up, keep the UI usable but show lightweight messaging.
        if (!cancelled) {
          setServices([]);
          setAbout(null);
          setContact(null);
        }
      } finally {
        if (!cancelled) {
          setLoadingServices(false);
          setLoadingAbout(false);
          setLoadingContact(false);
        }
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
      { id: "services", ref: servicesRef },
      { id: "about", ref: aboutRef },
      { id: "contact", ref: contactRef },
    ];

    const els = entries.map((e) => e.ref.current).filter(Boolean);
    if (els.length === 0) return undefined;

    const observer = new IntersectionObserver(
      (obsEntries) => {
        // Pick the most visible section.
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

  const onChange = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const markTouched = (key) => {
    setFormTouched((prev) => ({ ...prev, [key]: true }));
  };

  const canSubmit = !hasErrors && formStatus.state !== "loading";

  const onSubmit = async (e) => {
    e.preventDefault();
    setFormTouched({
      name: true,
      phone: true,
      email: true,
      mobileModel: true,
      problem: true,
    });

    if (Object.keys(validate(form)).length > 0) {
      setFormStatus({ state: "error", message: "Please fix the highlighted fields and try again." });
      return;
    }

    setFormStatus({ state: "loading", message: "Submitting…" });

    try {
      const payload = {
        name: String(form.name || "").trim(),
        phone: normalizePhone(form.phone),
        email: String(form.email || "").trim(),
        mobile_model: String(form.mobileModel || "").trim(),
        problem: String(form.problem || "").trim(),
      };

      const resp = await fetchJson("/api/submit_form", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      const msg = resp?.message || "Thanks! We received your request and will contact you shortly.";
      setFormStatus({ state: "success", message: msg });

      setForm({
        name: "",
        phone: "",
        email: "",
        mobileModel: "",
        problem: "",
      });
      setFormTouched({});
    } catch (err) {
      setFormStatus({
        state: "error",
        message: err?.message || "Something went wrong. Please try again in a moment.",
      });
    }
  };

  return (
    <div className="App">
      <a className="SkipLink" href="#main">
        Skip to content
      </a>

      <header className="Header">
        <div className="Header-inner">
          <div className="Brand" role="banner" onClick={() => scrollToSection("home")} tabIndex={0}>
            <div className="Brand-mark" aria-hidden="true">
              MS
            </div>
            <div className="Brand-text">
              <div className="Brand-title">Mobile Service</div>
              <div className="Brand-subtitle">Fast repairs • On-site support</div>
            </div>
          </div>

          <nav className="Nav" aria-label="Primary">
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
            <button type="button" className="NavCTA" onClick={() => scrollToSection("contact")}>
              Get Help
            </button>
          </nav>
        </div>
      </header>

      <main id="main" className="Main">
        {/* HOME */}
        <section ref={homeRef} data-section-id="home" className="Section Hero">
          <div className="Container Hero-grid">
            <div className="Hero-copy">
              <div className="Kicker">Mobile Service Website</div>
              <h1 className="H1">
                Professional mobile repair & troubleshooting,{" "}
                <span className="GradientText">done right</span>.
              </h1>
              <p className="Lead">
                Tell us what’s going on with your phone — we’ll respond quickly with next steps, pricing guidance,
                and availability.
              </p>

              <div className="Hero-actions">
                <button type="button" className="Button Primary" onClick={() => scrollToSection("contact")}>
                  Request Service
                </button>
                <button type="button" className="Button Ghost" onClick={() => scrollToSection("services")}>
                  View Services
                </button>
              </div>

              <div className="TrustRow" aria-label="Highlights">
                <div className="TrustPill">
                  <span className="Dot Dot-primary" aria-hidden="true" />
                  Same-day support
                </div>
                <div className="TrustPill">
                  <span className="Dot Dot-secondary" aria-hidden="true" />
                  Transparent pricing
                </div>
                <div className="TrustPill">
                  <span className="Dot Dot-primary" aria-hidden="true" />
                  Mobile-first experience
                </div>
              </div>
            </div>

            <div className="Hero-card" aria-label="Quick estimate card">
              <div className="GlassCard">
                <div className="GlassHeader">
                  <div className="GlassTitle">Quick Service Request</div>
                  <div className="GlassBadge">Animated form</div>
                </div>

                <form className="Form" onSubmit={onSubmit} noValidate>
                  <div className="FieldGrid">
                    <label className="Field">
                      <span className="FieldLabel">Name</span>
                      <input
                        className={`Input ${formTouched.name && errors.name ? "InputError" : ""}`}
                        value={form.name}
                        onChange={(e) => onChange("name", e.target.value)}
                        onBlur={() => markTouched("name")}
                        placeholder="Your name"
                        autoComplete="name"
                      />
                      {formTouched.name && errors.name ? <span className="FieldError">{errors.name}</span> : null}
                    </label>

                    <label className="Field">
                      <span className="FieldLabel">Phone</span>
                      <input
                        className={`Input ${formTouched.phone && errors.phone ? "InputError" : ""}`}
                        value={form.phone}
                        onChange={(e) => onChange("phone", e.target.value)}
                        onBlur={() => markTouched("phone")}
                        placeholder="+1 555 123 4567"
                        autoComplete="tel"
                        inputMode="tel"
                      />
                      {formTouched.phone && errors.phone ? <span className="FieldError">{errors.phone}</span> : null}
                    </label>

                    <label className="Field">
                      <span className="FieldLabel">Email</span>
                      <input
                        className={`Input ${formTouched.email && errors.email ? "InputError" : ""}`}
                        value={form.email}
                        onChange={(e) => onChange("email", e.target.value)}
                        onBlur={() => markTouched("email")}
                        placeholder="you@example.com"
                        autoComplete="email"
                        inputMode="email"
                      />
                      {formTouched.email && errors.email ? <span className="FieldError">{errors.email}</span> : null}
                    </label>

                    <label className="Field">
                      <span className="FieldLabel">Mobile Model</span>
                      <input
                        className={`Input ${formTouched.mobileModel && errors.mobileModel ? "InputError" : ""}`}
                        value={form.mobileModel}
                        onChange={(e) => onChange("mobileModel", e.target.value)}
                        onBlur={() => markTouched("mobileModel")}
                        placeholder="iPhone 14, Galaxy S23…"
                        autoComplete="off"
                      />
                      {formTouched.mobileModel && errors.mobileModel ? (
                        <span className="FieldError">{errors.mobileModel}</span>
                      ) : null}
                    </label>

                    <label className="Field FieldSpan2">
                      <span className="FieldLabel">Problem</span>
                      <textarea
                        className={`Textarea ${formTouched.problem && errors.problem ? "InputError" : ""}`}
                        value={form.problem}
                        onChange={(e) => onChange("problem", e.target.value)}
                        onBlur={() => markTouched("problem")}
                        placeholder="Tell us what’s happening (screen, battery, water damage, software, etc.)"
                        rows={4}
                      />
                      {formTouched.problem && errors.problem ? (
                        <span className="FieldError">{errors.problem}</span>
                      ) : null}
                    </label>
                  </div>

                  <div className="FormFooter">
                    <button type="submit" className="Button Primary" disabled={!canSubmit}>
                      {formStatus.state === "loading" ? "Submitting…" : "Submit Request"}
                    </button>

                    <div
                      className={`FormStatus ${
                        formStatus.state === "success"
                          ? "is-success"
                          : formStatus.state === "error"
                            ? "is-error"
                            : ""
                      }`}
                      role={formStatus.state === "error" ? "alert" : "status"}
                      aria-live="polite"
                    >
                      {formStatus.message}
                    </div>
                  </div>

                  <div className="FormHint">
                    By submitting, you agree to be contacted regarding your request. We never sell your data.
                  </div>
                </form>
              </div>
            </div>
          </div>
        </section>

        {/* SERVICES */}
        <section ref={servicesRef} data-section-id="services" className="Section">
          <div className="Container">
            <div className="SectionHeader">
              <h2 className="H2">Services</h2>
              <p className="Subhead">Common repairs and troubleshooting, delivered with clear communication.</p>
            </div>

            {loadingServices ? (
              <div className="Grid">
                {[0, 1, 2].map((k) => (
                  <div key={k} className="Card Skeleton" aria-hidden="true" />
                ))}
              </div>
            ) : services.length > 0 ? (
              <div className="Grid">
                {services.map((s) => (
                  <article key={s.id || s.title} className="Card Lift">
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
            ) : (
              <div className="EmptyState">
                <div className="EmptyTitle">Services are loading</div>
                <div className="EmptyText">
                  If this persists, ensure the backend is running on port 3001 and CORS is enabled.
                </div>
              </div>
            )}
          </div>
        </section>

        {/* ABOUT */}
        <section ref={aboutRef} data-section-id="about" className="Section Alt">
          <div className="Container">
            <div className="SectionHeader">
              <h2 className="H2">About</h2>
              <p className="Subhead">A modern repair experience built for speed, trust, and clarity.</p>
            </div>

            <div className="Split">
              <div className="Panel">
                <div className="PanelTitle">What we do</div>
                <p className="PanelText">
                  {loadingAbout
                    ? "Loading…"
                    : about?.description ||
                      "We help customers diagnose and resolve common mobile device issues—hardware and software—with clear steps and transparent pricing guidance."}
                </p>

                <div className="StatRow">
                  <div className="Stat">
                    <div className="StatValue">{about?.highlights?.[0]?.value || "24h"}</div>
                    <div className="StatLabel">{about?.highlights?.[0]?.label || "Response time"}</div>
                  </div>
                  <div className="Stat">
                    <div className="StatValue">{about?.highlights?.[1]?.value || "5★"}</div>
                    <div className="StatLabel">{about?.highlights?.[1]?.label || "Customer care"}</div>
                  </div>
                  <div className="Stat">
                    <div className="StatValue">{about?.highlights?.[2]?.value || "100%"}</div>
                    <div className="StatLabel">{about?.highlights?.[2]?.label || "Clarity"}</div>
                  </div>
                </div>
              </div>

              <div className="Panel Accent">
                <div className="PanelTitle">Why customers choose us</div>
                <ul className="Bullets">
                  {(about?.bullets && about.bullets.length > 0
                    ? about.bullets
                    : [
                        "Mobile-first process with a smooth, fast form",
                        "Clear updates and realistic timelines",
                        "Focus on the right fix (not the most expensive fix)",
                      ]
                  ).map((b) => (
                    <li key={b} className="Bullet">
                      <span className="Check" aria-hidden="true">
                        ✓
                      </span>
                      {b}
                    </li>
                  ))}
                </ul>

                <button type="button" className="Button Secondary" onClick={() => scrollToSection("contact")}>
                  Contact us
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
              <p className="Subhead">Prefer to reach out directly? Use the options below.</p>
            </div>

            <div className="ContactGrid">
              <div className="Card Lift">
                <div className="CardTitle">Business Hours</div>
                <div className="CardText">
                  {loadingContact
                    ? "Loading…"
                    : contact?.hours || "Mon–Sat: 9am–7pm • Sun: 11am–4pm"}
                </div>
              </div>

              <div className="Card Lift">
                <div className="CardTitle">Phone</div>
                <div className="CardText">{loadingContact ? "Loading…" : contact?.phone || "+1 (555) 123-4567"}</div>
                <a className="InlineLink" href={`tel:${(contact?.phone || "+15551234567").replace(/[^\d+]/g, "")}`}>
                  Call now
                </a>
              </div>

              <div className="Card Lift">
                <div className="CardTitle">Email</div>
                <div className="CardText">{loadingContact ? "Loading…" : contact?.email || "support@example.com"}</div>
                <a className="InlineLink" href={`mailto:${contact?.email || "support@example.com"}`}>
                  Email us
                </a>
              </div>
            </div>

            <div className="Footer">
              <div className="FooterInner">
                <div className="FooterBrand">
                  <div className="Brand-mark" aria-hidden="true">
                    MS
                  </div>
                  <div>
                    <div className="FooterTitle">Mobile Service</div>
                    <div className="FooterText">Ocean Professional theme • Smooth, responsive UI</div>
                  </div>
                </div>

                <div className="FooterLinks" aria-label="Footer navigation">
                  {sections.map((s) => (
                    <button key={s.id} type="button" className="FooterLink" onClick={() => scrollToSection(s.id)}>
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;
