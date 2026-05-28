export default function Footer() {
  const version = process.env.NEXT_PUBLIC_APP_VERSION ?? "";
  return (
    <footer className="bg-white border-t border-slate-100 py-3 px-6 shrink-0">
      <p className="text-xs text-slate-400 text-center">
        Togra {version} — Project Planning
      </p>
    </footer>
  );
}
