// LunarWindow mark: a landing-site crosshair over a crescent — our own motif (section indicator + logo).
export function Mark({ className = 'w-6 h-6' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" stroke="#d8eaff" strokeOpacity=".55" />
      <path d="M12 3.5a8.5 8.5 0 0 1 0 17a6 8.5 0 0 0 0-17Z" fill="#d8eaff" fillOpacity=".85" />
      <path d="M12 0v5M12 19v5M0 12h5M19 12h5" stroke="#1f58f2" strokeWidth="1.5" />
      <circle cx="12" cy="12" r="1.6" fill="#ff4105" />
    </svg>
  )
}
