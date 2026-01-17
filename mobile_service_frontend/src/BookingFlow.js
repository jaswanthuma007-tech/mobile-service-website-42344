import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";

/**
 * Backend base URL.
 * - In dev, CRA will use `src/setupProxy.js` to proxy `/api/*` to the backend.
 * - In environments without proxying, set REACT_APP_BACKEND_URL to e.g. http://localhost:3001
 */
const BACKEND_BASE_URL = process.env.REACT_APP_BACKEND_URL || "";

/** Small helper for JSON fetch with good error handling. */
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

function useQuery() {
  const { search } = useLocation();
  return useMemo(() => new URLSearchParams(search), [search]);
}

function cx(...parts) {
  return parts.filter(Boolean).join(" ");
}

function normalizeServicesValue(services) {
  const arr = Array.isArray(services) ? services : [];
  return arr.map((s) => String(s || "").trim()).filter(Boolean).join(", ");
}

// PUBLIC_INTERFACE
export default function BookingFlow() {
  /** mode:
   * - brand: step 1
   * - model: step 2
   * - service: step 3
   * - confirm: confirmation page
   */
  const { step, bookingId: bookingIdParam } = useParams();
  const bookingId = Number(bookingIdParam);
  const navigate = useNavigate();
  const query = useQuery();

  const [booking, setBooking] = useState(null);
  const [loadingBooking, setLoadingBooking] = useState(true);

  const [brands, setBrands] = useState([]);
  const [models, setModels] = useState([]);
  const [serviceOptions, setServiceOptions] = useState([]);

  const [searchText, setSearchText] = useState("");
  const [selectedBrand, setSelectedBrand] = useState(query.get("brand") || "");
  const [selectedModel, setSelectedModel] = useState(query.get("model") || "");
  const [selectedServices, setSelectedServices] = useState(() => {
    const raw = query.get("services") || "";
    return raw
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
  });

  const [uiState, setUiState] = useState({ state: "idle", message: "" }); // idle|loading|error|saving|done

  const stepKey = (step || "brand").toLowerCase();
  const currentStepIndex = stepKey === "brand" ? 1 : stepKey === "model" ? 2 : stepKey === "service" ? 3 : 3;

  useEffect(() => {
    let cancelled = false;

    async function loadBooking() {
      if (!bookingId || Number.isNaN(bookingId)) {
        setLoadingBooking(false);
        setUiState({ state: "error", message: "Invalid booking id." });
        return;
      }

      setLoadingBooking(true);
      try {
        const resp = await fetchJson(`/api/track?booking_id=${encodeURIComponent(String(bookingId))}`);
        if (cancelled) return;
        if (!resp?.found || !resp?.booking) {
          setUiState({ state: "error", message: resp?.message || "Booking not found." });
          setBooking(null);
        } else {
          setBooking(resp.booking);
        }
      } catch (err) {
        if (!cancelled) {
          setUiState({ state: "error", message: err?.message || "Unable to load booking details." });
        }
      } finally {
        if (!cancelled) setLoadingBooking(false);
      }
    }

    loadBooking();
    return () => {
      cancelled = true;
    };
  }, [bookingId]);

  // Load catalogs (brands/services) once.
  useEffect(() => {
    let cancelled = false;

    async function loadCatalogs() {
      try {
        const [b, svc] = await Promise.all([fetchJson("/api/brands"), fetchJson("/api/booking/services")]);
        if (cancelled) return;
        setBrands(Array.isArray(b?.brands) ? b.brands : []);
        setServiceOptions(Array.isArray(svc?.services) ? svc.services : []);
      } catch (err) {
        if (!cancelled) {
          setUiState({ state: "error", message: err?.message || "Unable to load device catalog." });
        }
      }
    }

    loadCatalogs();
    return () => {
      cancelled = true;
    };
  }, []);

  // Load models when brand changes or when entering model step.
  useEffect(() => {
    let cancelled = false;

    async function loadModels() {
      if (!selectedBrand) {
        setModels([]);
        return;
      }
      try {
        const m = await fetchJson(`/api/models?brand=${encodeURIComponent(selectedBrand)}`);
        if (cancelled) return;
        setModels(Array.isArray(m?.models) ? m.models : []);
      } catch (err) {
        if (!cancelled) {
          setUiState({ state: "error", message: err?.message || "Unable to load models." });
        }
      }
    }

    loadModels();
    return () => {
      cancelled = true;
    };
  }, [selectedBrand]);

  const filteredBrands = useMemo(() => {
    const q = String(searchText || "").trim().toLowerCase();
    if (!q) return brands;
    return brands.filter((b) => String(b?.name || "").toLowerCase().includes(q));
  }, [brands, searchText]);

  const filteredModels = useMemo(() => {
    const q = String(searchText || "").trim().toLowerCase();
    if (!q) return models;
    return models.filter((m) => String(m?.name || "").toLowerCase().includes(q));
  }, [models, searchText]);

  const filteredServices = useMemo(() => {
    const q = String(searchText || "").trim().toLowerCase();
    if (!q) return serviceOptions;
    return serviceOptions.filter((s) => String(s?.title || "").toLowerCase().includes(q));
  }, [serviceOptions, searchText]);

  const goTo = (nextStep, params = {}) => {
    const p = new URLSearchParams();
    const brand = params.brand ?? selectedBrand;
    const model = params.model ?? selectedModel;
    const services = params.services ?? selectedServices;

    if (brand) p.set("brand", brand);
    if (model) p.set("model", model);
    if (Array.isArray(services) && services.length > 0) p.set("services", services.join(","));

    const qs = p.toString();
    navigate(`/booking/${bookingId}/${nextStep}${qs ? `?${qs}` : ""}`);
  };

  const saveSelection = async (payload) => {
    setUiState({ state: "saving", message: "Saving..." });
    try {
      const resp = await fetchJson(`/api/booking/${bookingId}`, { method: "PUT", body: JSON.stringify(payload) });
      setBooking(resp?.booking || booking);
      setUiState({ state: "done", message: "" });
      return resp?.booking || null;
    } catch (err) {
      setUiState({ state: "error", message: err?.message || "Unable to save selection." });
      return null;
    }
  };

  const onPickBrand = async (brandName) => {
    setSelectedBrand(brandName);
    setSelectedModel("");
    setSelectedServices([]);
    await saveSelection({ brand: brandName, model: null, service: null });
    goTo("model", { brand: brandName, model: "", services: [] });
  };

  const onPickModel = async (modelName) => {
    setSelectedModel(modelName);
    setSelectedServices([]);
    await saveSelection({ brand: selectedBrand, model: modelName, service: null });
    goTo("service", { brand: selectedBrand, model: modelName, services: [] });
  };

  const toggleService = (serviceTitle) => {
    setSelectedServices((prev) => {
      const exists = prev.includes(serviceTitle);
      if (exists) return prev.filter((x) => x !== serviceTitle);
      return [...prev, serviceTitle];
    });
  };

  const confirmServices = async () => {
    if (selectedServices.length === 0) {
      setUiState({ state: "error", message: "Please select at least one repair service." });
      return;
    }
    const serviceValue = normalizeServicesValue(selectedServices);
    await saveSelection({ brand: selectedBrand, model: selectedModel, service: serviceValue });
    goTo("confirm", { brand: selectedBrand, model: selectedModel, services: selectedServices });
  };

  const headerTitle =
    stepKey === "brand"
      ? "Select Brand"
      : stepKey === "model"
        ? "Select Model"
        : stepKey === "service"
          ? "Select Repair Service"
          : "Confirmation";

  const canContinueToModel = !!selectedBrand;
  const canContinueToService = !!selectedBrand && !!selectedModel;

  return (
    <div className="FlowShell">
      <div className="FlowTop">
        <div className="FlowTopInner">
          <div className="FlowBreadcrumb">
            <Link className="FlowBack" to="/">
              ← Home
            </Link>
            <div className="FlowCrumbMeta">Booking #{bookingId}</div>
          </div>

          <div className="FlowHeader">
            <div className="FlowTitle">{headerTitle}</div>
            <div className="FlowSub">GoFix-style 3-step device selection</div>
          </div>

          <Progress steps={["Brand", "Model", "Service"]} activeIndex={currentStepIndex} />
        </div>
      </div>

      <div className="FlowBody">
        <div className="FlowCard">
          {loadingBooking ? (
            <div className="FlowLoading">Loading booking…</div>
          ) : booking ? (
            <div className="FlowBookingMeta">
              <div className="MetaRow">
                <div className="MetaItem">
                  <div className="MetaLabel">Customer</div>
                  <div className="MetaValue">{booking.name}</div>
                </div>
                <div className="MetaItem">
                  <div className="MetaLabel">Phone</div>
                  <div className="MetaValue">{booking.phone}</div>
                </div>
                <div className="MetaItem">
                  <div className="MetaLabel">Pincode</div>
                  <div className="MetaValue">{booking.pincode}</div>
                </div>
              </div>
              <div className="MetaPills">
                <span className="Pill">Status: {booking.status || "Pending"}</span>
                {selectedBrand ? <span className="Pill Pink">Brand: {selectedBrand}</span> : null}
                {selectedModel ? <span className="Pill Pink">Model: {selectedModel}</span> : null}
                {selectedServices.length ? <span className="Pill Pink">Services: {selectedServices.join(", ")}</span> : null}
              </div>
            </div>
          ) : (
            <div className="FlowErrorBox">Booking not found.</div>
          )}

          <div className="FlowSearchRow">
            <input
              className="Input"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder={stepKey === "service" ? "Search services…" : "Search…"}
            />
            <div className="FlowNavBtns">
              {stepKey === "model" ? (
                <button type="button" className="Button Secondary" onClick={() => goTo("brand", { model: "", services: [] })}>
                  Back
                </button>
              ) : stepKey === "service" ? (
                <button type="button" className="Button Secondary" onClick={() => goTo("model", { services: [] })}>
                  Back
                </button>
              ) : null}

              {stepKey === "model" ? (
                <button
                  type="button"
                  className="Button Primary PinkPrimary"
                  disabled={!canContinueToModel}
                  onClick={() => goTo("model")}
                >
                  Continue
                </button>
              ) : stepKey === "service" ? (
                <button
                  type="button"
                  className="Button Primary PinkPrimary"
                  disabled={!canContinueToService}
                  onClick={() => goTo("service")}
                >
                  Continue
                </button>
              ) : null}
            </div>
          </div>

          {uiState.message ? (
            <div className={cx("FlowMsg", uiState.state === "error" ? "is-error" : "")} role={uiState.state === "error" ? "alert" : "status"}>
              {uiState.message}
            </div>
          ) : null}

          {stepKey === "brand" ? (
            <div className="Grid FlowGrid">
              {filteredBrands.map((b) => (
                <button
                  key={b.id || b.name}
                  type="button"
                  className={cx("FlowChoiceCard", selectedBrand === b.name ? "is-selected" : "")}
                  onClick={() => onPickBrand(b.name)}
                >
                  <div className="FlowChoiceTitle">{b.name}</div>
                  <div className="FlowChoiceSub">Tap to continue</div>
                </button>
              ))}
            </div>
          ) : null}

          {stepKey === "model" ? (
            <div>
              {!selectedBrand ? (
                <div className="FlowHint">Pick a brand first.</div>
              ) : (
                <div className="Grid FlowGrid">
                  {filteredModels.map((m) => (
                    <button
                      key={m.id || m.name}
                      type="button"
                      className={cx("FlowChoiceCard", selectedModel === m.name ? "is-selected" : "")}
                      onClick={() => onPickModel(m.name)}
                    >
                      <div className="FlowChoiceTitle">{m.name}</div>
                      <div className="FlowChoiceSub">{m.brand}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : null}

          {stepKey === "service" ? (
            <div>
              {!selectedBrand || !selectedModel ? (
                <div className="FlowHint">Pick a brand and model first.</div>
              ) : (
                <>
                  <div className="Grid FlowGrid">
                    {filteredServices.map((s) => {
                      const checked = selectedServices.includes(s.title);
                      return (
                        <button
                          key={s.id || s.title}
                          type="button"
                          className={cx("FlowChoiceCard", checked ? "is-selected" : "")}
                          onClick={() => toggleService(s.title)}
                        >
                          <div className="FlowSvcRow">
                            <div className="FlowSvcIcon" aria-hidden="true">
                              {s.icon || "🛠️"}
                            </div>
                            <div className="FlowSvcMain">
                              <div className="FlowChoiceTitle">{s.title}</div>
                              <div className="FlowChoiceSub">{s.price_hint || "Price on inspection"}</div>
                            </div>
                            <div className={cx("FlowCheck", checked ? "is-on" : "")}>{checked ? "✓" : ""}</div>
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  <div className="FlowFooter">
                    <button type="button" className="Button Primary PinkPrimary" onClick={confirmServices}>
                      Confirm & Continue
                    </button>
                    <div className="FormHint">Select one or more services. We’ll confirm exact pricing after inspection.</div>
                  </div>
                </>
              )}
            </div>
          ) : null}

          {stepKey === "confirm" ? (
            <div className="ConfirmBox">
              <div className="ConfirmTitle">Booking Confirmation</div>

              <div className="ConfirmGrid">
                <div className="ConfirmItem">
                  <div className="ConfirmLabel">Booking ID</div>
                  <div className="ConfirmValue">#{bookingId}</div>
                </div>
                <div className="ConfirmItem">
                  <div className="ConfirmLabel">Customer</div>
                  <div className="ConfirmValue">{booking?.name || "—"}</div>
                </div>
                <div className="ConfirmItem">
                  <div className="ConfirmLabel">Phone</div>
                  <div className="ConfirmValue">{booking?.phone || "—"}</div>
                </div>
                <div className="ConfirmItem">
                  <div className="ConfirmLabel">Brand</div>
                  <div className="ConfirmValue">{selectedBrand || booking?.brand || "—"}</div>
                </div>
                <div className="ConfirmItem">
                  <div className="ConfirmLabel">Model</div>
                  <div className="ConfirmValue">{selectedModel || booking?.model || "—"}</div>
                </div>
                <div className="ConfirmItem ConfirmSpan2">
                  <div className="ConfirmLabel">Repair</div>
                  <div className="ConfirmValue">{selectedServices.join(", ") || booking?.service || "—"}</div>
                </div>
                <div className="ConfirmItem">
                  <div className="ConfirmLabel">Status</div>
                  <div className="ConfirmValue">{booking?.status || "Pending"}</div>
                </div>
              </div>

              <div className="ConfirmMsg">Our technician will contact you shortly.</div>

              <div className="ConfirmActions">
                <Link className="Button Secondary" to="/">
                  Back to Home
                </Link>
                <Link className="Button Primary PinkPrimary" to={`/booking/${bookingId}/brand`}>
                  Start Another Selection
                </Link>
              </div>
            </div>
          ) : null}
        </div>

        <div className="FlowBottomNote">
          Tip: Save your Booking ID. You can track status anytime using the Track Status section on the home page.
        </div>
      </div>
    </div>
  );
}

function Progress({ steps, activeIndex }) {
  return (
    <div className="Progress">
      {steps.map((label, idx) => {
        const stepNo = idx + 1;
        const state = stepNo < activeIndex ? "done" : stepNo === activeIndex ? "active" : "todo";
        return (
          <div key={label} className={cx("ProgressStep", `is-${state}`)}>
            <div className="ProgressDot">{stepNo}</div>
            <div className="ProgressLabel">{label}</div>
            {idx < steps.length - 1 ? <div className="ProgressBar" aria-hidden="true" /> : null}
          </div>
        );
      })}
    </div>
  );
}
