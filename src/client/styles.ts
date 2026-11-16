/**
 * The picker's look comes from CSS custom properties, so a theme restyles it without touching markup. Each
 * `--pg-*` variable falls back to a generic `--palette-*` token (as written by color-theory or any theme that
 * sets the same names), then to a plain default chosen for contrast (text 15:1, secondary text 7:1, accent 6:1
 * on the default surface; the focus ring is at least 3:1 against it).
 * Elements have stable `pg-*` classes and state sits in data attributes (`data-active`, `data-current`).
 */
export const PG_STYLES = `
.pg{--pg-text:var(--palette-text,#1f2937);--pg-muted:var(--palette-text-muted,#4b5563);--pg-line:var(--palette-border,#d1d5db);--pg-surface:var(--palette-surface-raised,#ffffff);--pg-hover:var(--palette-surface-hover,#f3f4f6);--pg-accent:var(--palette-primary,#1d4ed8);--pg-on-accent:var(--palette-on-primary,#ffffff);--pg-focus:var(--palette-focus,var(--palette-primary,#1d4ed8));--pg-tag-bg:#fef3c7;--pg-tag-text:#78350f;--pg-radius:14px;position:relative;display:inline-block;font:inherit;color:var(--pg-text)}
@media (prefers-color-scheme:dark){.pg{--pg-text:var(--palette-text,#f3f4f6);--pg-muted:var(--palette-text-muted,#cbd5e1);--pg-line:var(--palette-border,#475569);--pg-surface:var(--palette-surface-raised,#1e293b);--pg-hover:var(--palette-surface-hover,#334155);--pg-accent:var(--palette-primary,#93c5fd);--pg-on-accent:var(--palette-on-primary,#0f172a);--pg-tag-bg:#78350f;--pg-tag-text:#fef3c7}}
.pg *{box-sizing:border-box}
.pg-trigger{display:inline-flex;align-items:center;gap:.5rem;min-height:44px;padding:.375rem .875rem;border:1px solid var(--pg-line);border-radius:999px;background:var(--pg-surface);color:var(--pg-text);font:inherit;font-size:.9375rem;cursor:pointer;transition:background-color .15s,border-color .15s}
.pg-trigger:hover{background:var(--pg-hover)}
.pg-trigger svg{width:1.125rem;height:1.125rem;flex:none}
.pg-trigger__chevron{opacity:.7}
.pg :focus-visible{outline:3px solid var(--pg-focus);outline-offset:2px}
.pg-backdrop{position:fixed;inset:0;z-index:60;background:transparent}
.pg-panel{position:absolute;z-index:61;top:calc(100% + .5rem);right:0;width:min(24rem,calc(100vw - 2rem));max-height:min(32rem,70vh);display:flex;flex-direction:column;border:1px solid var(--pg-line);border-radius:var(--pg-radius);background:var(--pg-surface);box-shadow:0 18px 50px -12px rgba(15,23,42,.35);overflow:hidden}
.pg-head{display:flex;align-items:center;gap:.5rem;padding:.75rem;border-bottom:1px solid var(--pg-line)}
.pg-search{flex:1;min-width:0;min-height:44px;padding:.5rem .875rem;border:1px solid var(--pg-line);border-radius:999px;background:var(--pg-surface);color:var(--pg-text);font:inherit;font-size:1rem}
.pg-search::placeholder{color:var(--pg-muted);opacity:1}
.pg-close{display:none;min-width:44px;min-height:44px;border:0;border-radius:999px;background:transparent;color:var(--pg-text);font:inherit;cursor:pointer}
.pg-close:hover{background:var(--pg-hover)}
.pg-list{flex:1;overflow-y:auto;overscroll-behavior:contain;padding:.375rem}
.pg-group__title{margin:0;padding:.625rem .75rem .25rem;font-size:.8125rem;font-weight:600;color:var(--pg-muted)}
.pg-option{display:flex;align-items:center;gap:.75rem;min-height:48px;padding:.5rem .75rem;border-radius:10px;cursor:pointer;color:var(--pg-text)}
.pg-option[data-active=true]{background:var(--pg-hover)}
.pg-option[data-current=true] .pg-option__native{font-weight:600}
.pg-option__names{flex:1;min-width:0;display:flex;flex-direction:column}
.pg-option__english{font-size:.8125rem;color:var(--pg-muted)}
.pg-option__mark{flex:none;width:1.25rem;height:1.25rem;color:var(--pg-accent)}
.pg-tag{flex:none;padding:.125rem .5rem;border-radius:999px;background:var(--pg-tag-bg);color:var(--pg-tag-text);font-size:.75rem;font-weight:600}
.pg-votes{flex:none;display:inline-flex;align-items:center;gap:.375rem;padding:.25rem .625rem;border:1px solid var(--pg-line);border-radius:999px;font-size:.8125rem;color:var(--pg-muted)}
.pg-option[aria-checked=true] .pg-votes{border-color:var(--pg-accent);background:var(--pg-accent);color:var(--pg-on-accent)}
.pg-empty,.pg-hint,.pg-foot{margin:0;padding:.75rem;font-size:.875rem;color:var(--pg-muted)}
.pg-foot{border-top:1px solid var(--pg-line)}
.pg-foot a{color:var(--pg-accent);font-weight:600;text-decoration:underline;text-underline-offset:2px}
.pg-sr{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}
@media (max-width:640px){
.pg{position:static}
.pg-backdrop{background:rgba(15,23,42,.5)}
.pg-panel{position:fixed;top:auto;left:0;right:0;bottom:0;width:100%;max-height:85vh;border-radius:20px 20px 0 0;border-width:1px 0 0;padding-bottom:env(safe-area-inset-bottom)}
.pg-panel::before{content:'';display:block;width:2.5rem;height:.25rem;margin:.5rem auto 0;border-radius:999px;background:var(--pg-line)}
.pg-close{display:inline-flex;align-items:center;justify-content:center}
}
@media (prefers-reduced-motion:no-preference){
.pg-panel{animation:pg-in .18s ease-out}
@keyframes pg-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
@media (max-width:640px){.pg-panel{animation-name:pg-sheet}@keyframes pg-sheet{from{transform:translateY(100%)}to{transform:none}}}
}
@media (forced-colors:active){.pg-option[data-active=true]{outline:2px solid Highlight}.pg-tag,.pg-votes{border:1px solid CanvasText}}
`
