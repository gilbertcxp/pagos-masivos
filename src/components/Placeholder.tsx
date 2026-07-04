export default function Placeholder({
  titulo,
  descripcion,
  paso,
}: {
  titulo: string;
  descripcion: string;
  paso?: string;
}) {
  return (
    <div className="space-y-6">
      <div>
        {paso && (
          <span className="mb-1 inline-block rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-700">
            {paso}
          </span>
        )}
        <h1 className="text-2xl font-bold text-slate-800">{titulo}</h1>
        <p className="text-slate-500">{descripcion}</p>
      </div>

      <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-white py-20 text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-400">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
        </div>
        <p className="font-medium text-slate-600">Módulo en construcción</p>
        <p className="text-sm text-slate-400">Lo desarrollaremos en la siguiente fase.</p>
      </div>
    </div>
  );
}
