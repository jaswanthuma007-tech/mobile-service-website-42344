import React from "react";
import "./TopInfoBar.css";

/**
 * Inline SVG icon set (no external asset dependency).
 * Matches the requested set: phone, email, clock, Instagram, Facebook, YouTube.
 */
function PhoneIcon(props) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false" {...props}>
      <path
        fill="currentColor"
        d="M6.62 10.79a15.09 15.09 0 0 0 6.59 6.59l2.2-2.2a1 1 0 0 1 1.02-.24c1.12.37 2.33.57 3.57.57a1 1 0 0 1 1 1V21a1 1 0 0 1-1 1C10.07 22 2 13.93 2 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.24.2 2.45.57 3.57a1 1 0 0 1-.24 1.02l-2.2 2.2Z"
      />
    </svg>
  );
}

function MailIcon(props) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false" {...props}>
      <path
        fill="currentColor"
        d="M20 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2Zm0 4-8 5L4 8V6l8 5 8-5v2Z"
      />
    </svg>
  );
}

function ClockIcon(props) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false" {...props}>
      <path
        fill="currentColor"
        d="M12 2a10 10 0 1 0 .001 20.001A10 10 0 0 0 12 2Zm1 11h-5V7h2v4h3v2Z"
      />
    </svg>
  );
}

function InstagramIcon(props) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false" {...props}>
      <path
        fill="currentColor"
        d="M7.5 2h9A5.5 5.5 0 0 1 22 7.5v9A5.5 5.5 0 0 1 16.5 22h-9A5.5 5.5 0 0 1 2 16.5v-9A5.5 5.5 0 0 1 7.5 2Zm9 2h-9A3.5 3.5 0 0 0 4 7.5v9A3.5 3.5 0 0 0 7.5 20h9a3.5 3.5 0 0 0 3.5-3.5v-9A3.5 3.5 0 0 0 16.5 4Zm-4.5 3.2A4.8 4.8 0 1 1 7.2 12 4.8 4.8 0 0 1 12 7.2Zm0 2A2.8 2.8 0 1 0 14.8 12 2.8 2.8 0 0 0 12 9.2ZM17.3 6.6a1 1 0 1 1-1 1 1 1 0 0 1 1-1Z"
      />
    </svg>
  );
}

function FacebookIcon(props) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false" {...props}>
      <path
        fill="currentColor"
        d="M13.5 22v-8h2.7l.4-3H13.5V9.1c0-.9.3-1.5 1.6-1.5h1.7V5c-.3 0-1.4-.1-2.7-.1-2.7 0-4.6 1.7-4.6 4.8V11H7v3h2.5v8h4Z"
      />
    </svg>
  );
}

function YouTubeIcon(props) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false" {...props}>
      <path
        fill="currentColor"
        d="M21.6 7.2a3 3 0 0 0-2.1-2.1C17.6 4.6 12 4.6 12 4.6s-5.6 0-7.5.5A3 3 0 0 0 2.4 7.2 31 31 0 0 0 2 12a31 31 0 0 0 .4 4.8 3 3 0 0 0 2.1 2.1c1.9.5 7.5.5 7.5.5s5.6 0 7.5-.5a3 3 0 0 0 2.1-2.1A31 31 0 0 0 22 12a31 31 0 0 0-.4-4.8ZM10 15.5v-7l6 3.5-6 3.5Z"
      />
    </svg>
  );
}

/**
 * PUBLIC_INTERFACE
 * TopInfoBar: GoFix-inspired sticky info bar with contact info and social icons.
 *
 * - Sticky positioning: top: 0; z-index: 50
 * - Responsive behavior: stacks into two rows on mobile; social becomes icons-only
 * - Accessibility: aria-labels, focus styles
 */
export default function TopInfoBar({
  phone = "+1 (555) 123-4567",
  phoneHref = "tel:+15551234567",
  email = "support@example.com",
  emailHref = "mailto:support@example.com",
  hours = "Mon–Sat 9am–7pm",
  social = {
    instagram: "https://instagram.com",
    facebook: "https://facebook.com",
    youtube: "https://youtube.com",
  },
}) {
  return (
    <div className="TopInfoBar" role="note" aria-label="Contact quick info">
      <div className="Container TopInfoBar-inner">
        <div className="TopInfoBar-left" aria-label="Contact details">
          <a className="TopInfoBar-item" href={phoneHref}>
            <span className="TopInfoBar-ico" aria-hidden="true">
              <PhoneIcon />
            </span>
            <span className="TopInfoBar-text">{phone}</span>
          </a>

          <span className="TopInfoBar-divider" aria-hidden="true" />

          <a className="TopInfoBar-item" href={emailHref}>
            <span className="TopInfoBar-ico" aria-hidden="true">
              <MailIcon />
            </span>
            <span className="TopInfoBar-text">{email}</span>
          </a>

          <span className="TopInfoBar-divider" aria-hidden="true" />

          <div className="TopInfoBar-item" aria-label={`Hours: ${hours}`}>
            <span className="TopInfoBar-ico" aria-hidden="true">
              <ClockIcon />
            </span>
            <span className="TopInfoBar-text">{hours}</span>
          </div>
        </div>

        <div className="TopInfoBar-right" aria-label="Social links">
          <a
            className="TopInfoBar-social"
            href={social.instagram}
            target="_blank"
            rel="noreferrer"
            aria-label="Instagram"
            title="Instagram"
          >
            <InstagramIcon />
          </a>
          <a
            className="TopInfoBar-social"
            href={social.facebook}
            target="_blank"
            rel="noreferrer"
            aria-label="Facebook"
            title="Facebook"
          >
            <FacebookIcon />
          </a>
          <a
            className="TopInfoBar-social"
            href={social.youtube}
            target="_blank"
            rel="noreferrer"
            aria-label="YouTube"
            title="YouTube"
          >
            <YouTubeIcon />
          </a>
        </div>
      </div>
    </div>
  );
}
