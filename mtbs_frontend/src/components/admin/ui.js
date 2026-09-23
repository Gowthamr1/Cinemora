import React from 'react';

/* Shared building blocks for Admin management console with Cinematic Dark UI. */

export const Modal = ({ title, onClose, children, footer, wide }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/80 backdrop-blur-md p-4 py-10"
       onClick={onClose}>
    <div className={`glass-panel border border-slate-800 rounded-3xl shadow-2xl w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} overflow-hidden`}
         onClick={(e) => e.stopPropagation()}>
      <div className="flex justify-between items-center border-b border-slate-800/80 px-6 py-4">
        <h3 className="text-xl font-bold font-display text-white">{title}</h3>
        <button onClick={onClose} className="text-slate-400 hover:text-white text-2xl leading-none">×</button>
      </div>
      <div className="p-6 space-y-4">{children}</div>
      {footer && (
        <div className="border-t border-slate-800/80 px-6 py-4 flex justify-end gap-3 bg-slate-900/60 rounded-b-3xl">
          {footer}
        </div>
      )}
    </div>
  </div>
);

export const Field = ({ label, hint, children }) => (
  <label className="block text-xs font-semibold text-slate-300 uppercase space-y-1">
    <span>{label}</span>
    {children}
    {hint && <span className="block text-[11px] text-slate-400 normal-case font-normal">{hint}</span>}
  </label>
);

export const input = 'block w-full bg-slate-900 border border-slate-800 focus:border-rose-500 text-slate-100 text-sm px-3.5 py-2.5 rounded-xl outline-none transition-all placeholder-slate-600 mt-1';

export const Btn = ({ variant = 'primary', className = '', ...props }) => {
  const styles = {
    primary: 'bg-rose-600 hover:bg-rose-500 text-white font-bold shadow-lg shadow-rose-600/20',
    success: 'bg-gradient-to-r from-rose-600 to-amber-500 hover:from-rose-500 hover:to-amber-400 text-white font-extrabold shadow-lg shadow-rose-600/20',
    danger: 'bg-rose-600/20 border border-rose-500/30 hover:bg-rose-600 text-rose-300 hover:text-white font-bold',
    ghost: 'bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 font-semibold',
  }[variant];
  return <button className={`px-4 py-2.5 rounded-xl text-xs transition-all disabled:opacity-50 ${styles} ${className}`} {...props} />;
};

export const EmptyState = ({ icon, title, hint, action }) => (
  <div className="text-center py-16 glass-panel rounded-3xl border border-slate-800 text-slate-400">
    <div className="text-5xl mb-3">{icon}</div>
    <p className="font-bold text-lg text-white font-display">{title}</p>
    {hint && <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">{hint}</p>}
    {action && <div className="mt-6">{action}</div>}
  </div>
);

export const SectionHeader = ({ title, subtitle, onBack, action }) => (
  <div className="flex flex-wrap justify-between items-center gap-4 mb-6">
    <div className="flex items-center gap-3">
      <button onClick={onBack} className="text-xs font-bold text-slate-400 hover:text-white transition-colors bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-xl">
        ← Back to Admin Console
      </button>
      <div>
        <h2 className="text-2xl sm:text-3xl font-black font-display text-white tracking-tight leading-tight">{title}</h2>
        {subtitle && <p className="text-xs text-slate-400 font-semibold mt-0.5">{subtitle}</p>}
      </div>
    </div>
    {action}
  </div>
);

/* Clickable tile on the admin home screen */
export const NavCard = ({ icon, title, count, description, onClick, accent }) => (
  <button onClick={onClick}
    className="text-left glass-card glass-card-hover rounded-3xl p-6 border border-slate-800 flex flex-col justify-between group transition-all">
    <div className="flex justify-between items-start mb-4">
      <span className="text-3xl">{icon}</span>
      {count !== undefined && (
        <span className={`text-2xl font-black font-display ${accent || 'text-amber-400'}`}>{count}</span>
      )}
    </div>
    <h3 className="text-lg font-bold font-display text-white group-hover:text-amber-400 transition-colors">{title}</h3>
    <p className="text-xs text-slate-400 leading-relaxed mt-1">{description}</p>
  </button>
);
