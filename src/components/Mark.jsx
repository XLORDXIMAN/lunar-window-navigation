// MainTech mark: white flag with a 4-point star on a thin pole (logo + section indicator).
export function Mark({ className = 'w-6 h-6' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <path d="M4.2 22 L6.6 4.6" stroke="#d8eaff" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M6.6 4.6 C10 3.2 12.6 6 16.4 4.9 C18.4 4.3 20 3.6 21.4 3.2 L19.6 13.6 C18 14.2 16.6 15 14.6 15.4 C11 16.1 8.6 13.6 5.4 14.6 Z" fill="#eef3fb" />
      <path d="M13.4 6.4 L14.1 8.8 L16.5 9.5 L14.1 10.2 L13.4 12.6 L12.7 10.2 L10.3 9.5 L12.7 8.8 Z" fill="#0b0f18" />
    </svg>
  )
}
